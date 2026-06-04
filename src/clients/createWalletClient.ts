import { TronWeb } from '../tronweb.js';
import type { HttpProvider } from '../lib/providers/index.js';
import type {
    DeployContractParameters,
    SendRawTransactionParameters,
    SendTransactionParams,
    SendTransactionReturn,
    SendTransactionType,
    SignTransactionParameters,
    WalletClient,
    WalletClientConfig,
    WriteContractParameters,
} from './types.js';
import type { WalletAccount } from '../accounts/types.js';
import type { ContractAbiInterface, FunctionFragment } from '../types/ABI.js';
import type { SignedTransaction, Transaction } from '../types/Transaction.js';
import { toHex } from '../utils/address.js';
import { createClientQueryActions } from './createClientQueryActions.js';
import { createClientMetadata } from './createClientMetadata.js';
import { resolveClientProviders } from './resolveClientConfig.js';
import { buildFunctionSelector } from '../utils/abi.js';
import * as tbActions from '../lib/actions/transactionBuilder.js';
import * as trxActions from '../lib/actions/trx.js';

const SEND_TRANSACTION_NEEDS_SOLIDITY: ReadonlySet<SendTransactionType> = new Set([
    'triggerSmartContract',
    'triggerConstantContract',
    'triggerConfirmedConstantContract',
    'estimateEnergy',
    'deployConstantContract',
]);

const SEND_TRANSACTION_NEEDS_CACHE: ReadonlySet<SendTransactionType> = new Set(['clearABI']);

// Constant/read-only actions: they query the node and return a result instead of a
// broadcastable transaction, so sendTransaction returns that result directly without
// signing or broadcasting.
const SEND_TRANSACTION_CONSTANT: ReadonlySet<SendTransactionType> = new Set([
    'triggerConstantContract',
    'triggerConfirmedConstantContract',
    'estimateEnergy',
    'deployConstantContract',
]);

const SEND_TRANSACTION_ALLOWED: ReadonlySet<SendTransactionType> = new Set([
    'sendTrx',
    'sendToken',
    'purchaseToken',
    'freezeBalance',
    'unfreezeBalance',
    'freezeBalanceV2',
    'unfreezeBalanceV2',
    'cancelUnfreezeBalanceV2',
    'delegateResource',
    'undelegateResource',
    'withdrawExpireUnfreeze',
    'withdrawBlockRewards',
    'applyForSR',
    'vote',
    'updateBrokerage',
    'createSmartContract',
    'triggerSmartContract',
    'triggerConstantContract',
    'triggerConfirmedConstantContract',
    'estimateEnergy',
    'deployConstantContract',
    'clearABI',
    'createToken',
    'updateToken',
    'createAccount',
    'updateAccount',
    'setAccountId',
    'createProposal',
    'deleteProposal',
    'voteProposal',
    'createTRXExchange',
    'createTokenExchange',
    'injectExchangeTokens',
    'withdrawExchangeTokens',
    'tradeExchangeTokens',
    'updateSetting',
    'updateEnergyLimit',
    'updateAccountPermissions',
    'newTxID',
    'alterTransaction',
    'extendExpiration',
    'addUpdateData',
]);

// Index of the options object (which carries `feeLimit`) within the positional
// `parameters` array passed to sendTransaction, for the contract-building actions
// whose validator requires `feeLimit > 0`. The typed writeContract/deployContract
// helpers inject the client feeLimit themselves; the generic dispatcher must do the
// same, otherwise a bare sendTransaction({ type: 'createSmartContract', parameters:
// [...] }) with no feeLimit throws "Invalid feeLimit provided".
const FEE_LIMIT_OPTIONS_INDEX: Partial<Record<SendTransactionType, number>> = {
    createSmartContract: 0,
    triggerSmartContract: 2,
    triggerConstantContract: 2,
    triggerConfirmedConstantContract: 2,
    estimateEnergy: 2,
};

// Merge the client's default feeLimit into the options arg when the caller omitted it
// (or passed a falsy 0). Mirrors the legacy `options.feeLimit || tronWeb.feeLimit` fallback.
function applyDefaultFeeLimit(
    type: SendTransactionType,
    parameters: readonly unknown[],
    feeLimit: number
): readonly unknown[] {
    const optionsIndex = FEE_LIMIT_OPTIONS_INDEX[type];
    if (optionsIndex === undefined) return parameters;

    const options = parameters[optionsIndex];
    // Only inject into a plain options object; leave unexpected shapes for the action to validate.
    if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options))) {
        return parameters;
    }

    const current = options as { feeLimit?: number } | undefined;
    const next = parameters.slice();
    next[optionsIndex] = { ...current, feeLimit: current?.feeLimit || feeLimit };
    return next;
}

function isReadOnlyFunctionFragment(fragment: FunctionFragment): boolean {
    const stateMutability = (fragment.stateMutability ?? '').toLowerCase();
    return stateMutability === 'view' || stateMutability === 'pure' || fragment.constant === true;
}

function getWriteContractFragment<
    Abi extends ContractAbiInterface,
    FunctionName extends WriteContractParameters<Abi>['functionName'],
>(abi: Abi, functionName: FunctionName): FunctionFragment {
    const fragment = abi.find(
        (item): item is FunctionFragment => item.type === 'function' && 'name' in item && item.name === functionName
    );

    if (!fragment) {
        throw new Error(`ABI fragment not found for function "${String(functionName)}".`);
    }

    if (isReadOnlyFunctionFragment(fragment)) {
        throw new Error(`Function "${String(functionName)}" is read-only.`);
    }

    return fragment;
}

function resolveCallValue(value: number | bigint | undefined): number | undefined {
    if (value === undefined) return undefined;
    return typeof value === 'bigint' ? Number(value) : value;
}

function resolveSignerAddress(account: WalletAccount, accountOverride: string | undefined): string {
    if (accountOverride === undefined) return account.address;
    if (toHex(accountOverride).toLowerCase() !== toHex(account.address).toLowerCase()) {
        throw new Error('Wallet client account override must match the configured account.');
    }
    return accountOverride;
}

function getBroadcastErrorMessage(broadcast: Record<string, unknown>): string {
    if (typeof broadcast.message === 'string' && broadcast.message.length > 0) {
        return TronWeb.toUtf8(broadcast.message);
    }

    if (typeof broadcast.code === 'string' && broadcast.code.length > 0) {
        return broadcast.code;
    }

    return 'Failed to broadcast transaction';
}

function assertBroadcastOk(broadcast: unknown): void {
    if (broadcast && typeof broadcast === 'object' && (broadcast as { code?: unknown }).code) {
        throw new Error(getBroadcastErrorMessage(broadcast as Record<string, unknown>));
    }
}

/**
 * Create a write-capable client.
 *
 * The client uses the provided Account for all signing operations. The Account's
 * private key is never exposed — signing is delegated to `account.signTransaction()`.
 *
 * @example
 * ```ts
 * const account = privateKeyToAccount('0xyour-private-key');
 * const walletClient = createWalletClient({
 *   chain: nile,
 *   transport: http(),
 *   account,
 * });
 *
 * // Build, sign, and broadcast a TRX transfer
 * const result = await walletClient.sendTransaction({
 *   type: 'sendTrx',
 *   parameters: ['TXx...toAddress', 1_000_000, 'TXx...fromAddress'],
 * });
 * ```
 */
export function createWalletClient<TAccount extends WalletAccount>(config: WalletClientConfig<TAccount>): WalletClient<TAccount> {
    const { account, key, name, ...clientConfig } = config;
    const { chain, transport, fullNode, solidityNode, eventServer, feeLimit } = resolveClientProviders(clientConfig);

    // Per-client ABI cache (replaces the old `tronWeb.trx.cache`). Reset on each
    // client construction so cached contracts never bleed across instances.
    const contractCache = { contracts: {} as Record<string, unknown> };

    const dispatchSendTransaction = (type: SendTransactionType, parameters: readonly unknown[]) => {
        if (!SEND_TRANSACTION_ALLOWED.has(type)) {
            throw new Error(`Unknown sendTransaction type: "${String(type)}"`);
        }
        const fn = (tbActions as Record<string, unknown>)[type] as (...args: unknown[]) => Promise<unknown>;
        const prefix: unknown[] = [fullNode];
        if (SEND_TRANSACTION_NEEDS_SOLIDITY.has(type)) prefix.push(solidityNode);
        if (SEND_TRANSACTION_NEEDS_CACHE.has(type)) prefix.push(contractCache);
        return fn(...prefix, ...applyDefaultFeeLimit(type, parameters, feeLimit));
    };

    const sendTransaction = async <K extends SendTransactionType>(
        params: SendTransactionParams<K>
    ): Promise<SendTransactionReturn<K>> => {
        const { type, parameters } = params;
        const result = (await dispatchSendTransaction(type, parameters as readonly unknown[])) as any;

        // Constant/read-only actions don't yield a broadcastable transaction — return
        // the node's query result as-is, skipping signing and broadcasting.
        if (SEND_TRANSACTION_CONSTANT.has(type)) {
            return result as SendTransactionReturn<K>;
        }

        // triggerSmartContract returns { result, transaction }; pure builders return Transaction directly.
        const transaction = result?.transaction ?? result;

        if (!transaction || !transaction.txID) {
            throw new Error('action did not return a valid transaction object');
        }

        const signed = await account.signTransaction(transaction);

        const broadcast = await trxActions.sendRawTransaction(fullNode, signed);
        assertBroadcastOk(broadcast);
        return broadcast as SendTransactionReturn<K>;
    };

    const getAddresses = async () => [account.address] as const;

    const requestAddresses = async () => getAddresses();

    const sendRawTransaction = async <TTransaction extends SignedTransaction = SignedTransaction>({
        transaction,
    }: SendRawTransactionParameters<TTransaction>) => trxActions.sendRawTransaction(fullNode, transaction);

    const signMessage = async (input: Parameters<TAccount['signMessage']>[0]) => account.signMessage(input);

    const signTransaction = async <TTransaction extends Transaction = Transaction>({
        transaction,
    }: SignTransactionParameters<TTransaction>) => account.signTransaction(transaction);

    const signTypedData = async (input: Parameters<TAccount['signTypedData']>[0]) => account.signTypedData(input);

    const writeContract = async <
        Abi extends ContractAbiInterface,
        FunctionName extends WriteContractParameters<Abi>['functionName'],
    >({
        address,
        abi,
        functionName,
        args,
        account: accountOverride,
        value,
        feeLimit: callFeeLimit,
        tokenId,
        tokenValue,
        permissionId,
    }: WriteContractParameters<Abi, FunctionName>) => {
        const signerAddress = resolveSignerAddress(account, accountOverride);
        const fragment = getWriteContractFragment(abi, functionName);
        const callValue = resolveCallValue(value);
        const txWrapper = await tbActions.triggerSmartContract(
            fullNode,
            solidityNode,
            address,
            buildFunctionSelector(fragment),
            {
                feeLimit: callFeeLimit ?? feeLimit,
                ...(callValue !== undefined ? { callValue } : {}),
                ...(tokenId !== undefined ? { tokenId } : {}),
                ...(tokenValue !== undefined ? { tokenValue } : {}),
                ...(permissionId !== undefined ? { permissionId } : {}),
                funcABIV2: fragment,
                parametersV2: args,
            },
            [],
            signerAddress
        );

        if (!txWrapper.result?.result) {
            throw new Error('Failed to build transaction: ' + (txWrapper.result?.message ?? JSON.stringify(txWrapper)));
        }

        if (!txWrapper.transaction || !txWrapper.transaction.txID) {
            throw new Error('triggerSmartContract did not return a valid transaction object');
        }

        const signed = await account.signTransaction(txWrapper.transaction);
        const broadcast = await trxActions.sendRawTransaction(fullNode, signed);
        assertBroadcastOk(broadcast);

        return signed.txID;
    };

    const deployContract = async <Abi extends ContractAbiInterface>({
        abi,
        bytecode,
        args,
        account: accountOverride,
        name: contractName,
        value,
        feeLimit: deployFeeLimit,
        tokenId,
        tokenValue,
        userFeePercentage,
        originEnergyLimit,
        permissionId,
        blockHeader,
        rawParameter,
    }: DeployContractParameters<Abi>) => {
        const signerAddress = resolveSignerAddress(account, accountOverride);
        const callValue = resolveCallValue(value);
        const transaction = await tbActions.createSmartContract(
            fullNode,
            {
                abi,
                bytecode,
                feeLimit: deployFeeLimit ?? feeLimit,
                ...(args !== undefined ? { parameters: [...args] } : {}),
                ...(contractName !== undefined ? { name: contractName } : {}),
                ...(callValue !== undefined ? { callValue } : {}),
                ...(tokenId !== undefined ? { tokenId } : {}),
                ...(tokenValue !== undefined ? { tokenValue } : {}),
                ...(userFeePercentage !== undefined ? { userFeePercentage } : {}),
                ...(originEnergyLimit !== undefined ? { originEnergyLimit } : {}),
                ...(permissionId !== undefined ? { permissionId } : {}),
                ...(blockHeader !== undefined ? { blockHeader } : {}),
                ...(rawParameter !== undefined ? { rawParameter } : {}),
            },
            signerAddress
        );

        if (!transaction || !transaction.txID) {
            throw new Error('createSmartContract did not return a valid transaction object');
        }

        const signed = await account.signTransaction(transaction);
        const broadcast = await trxActions.sendRawTransaction(fullNode, signed);
        assertBroadcastOk(broadcast);

        return signed.txID;
    };

    const metadata = createClientMetadata({
        key,
        name,
        defaultKey: 'wallet',
        defaultName: 'Wallet Client',
        type: 'walletClient',
    });
    const queryActions = createClientQueryActions({
        chain,
        fullNode,
        solidityNode,
        eventServer,
        feeLimit,
        defaultAddress: account.address,
    });

    const client: WalletClient<TAccount> = {
        ...metadata,
        ...queryActions,
        get chain() {
            return chain;
        },
        get transport() {
            return transport;
        },
        get account() {
            return account;
        },
        getAddresses,
        requestAddresses,
        sendRawTransaction,
        signMessage,
        signTransaction,
        signTypedData,
        writeContract,
        deployContract,
        sendTransaction,
    };

    return client;
}

// Re-export HttpProvider so downstream code can import it from here as before.
export type { HttpProvider };
