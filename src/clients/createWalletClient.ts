import { TronWeb } from '../tronweb.js';
import type {
    DeployContractParameters,
    SendRawTransactionParameters,
    SendTransactionParams,
    SignTransactionParameters,
    WalletClient,
    WalletClientConfig,
    WriteContractParameters,
} from './types.js';
import type { WalletAccount } from '../accounts/types.js';
import type { ContractAbiInterface, FunctionFragment } from '../types/ABI.js';
import type { TransactionBuilder } from '../lib/TransactionBuilder/TransactionBuilder.js';
import type { SignedTransaction, Transaction } from '../types/Transaction.js';
import type { BroadcastReturn } from '../types/Trx.js';
import { toHex } from '../utils/address.js';
import { createClientQueryActions } from './createClientQueryActions.js';
import { createClientMetadata } from './createClientMetadata.js';
import { resolveClientConfig } from './resolveClientConfig.js';

function isReadOnlyFunctionFragment(fragment: FunctionFragment): boolean {
    const stateMutability = (fragment.stateMutability ?? '').toLowerCase();
    return stateMutability === 'view' || stateMutability === 'pure' || fragment.constant === true;
}

function buildFunctionSelector(fragment: FunctionFragment): string {
    const inputs = fragment.inputs ?? [];
    return `${fragment.name}(${inputs.map((input) => input.type).join(',')})`;
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

function getBroadcastErrorMessage(tronWeb: TronWeb, broadcast: Record<string, unknown>): string {
    if (typeof broadcast.message === 'string' && broadcast.message.length > 0) {
        return tronWeb.toUtf8(broadcast.message);
    }

    if (typeof broadcast.code === 'string' && broadcast.code.length > 0) {
        return broadcast.code;
    }

    return 'Failed to broadcast transaction';
}

/**
 * Create a write-capable TronWeb client.
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
    const { chain, transport, tronWebConfig } = resolveClientConfig(clientConfig);
    // Initialise TronWeb with the account's address so the default address is set,
    // but we never pass the raw private key — signing always goes through account.signTransaction().
    const tronWeb = new TronWeb({ ...tronWebConfig });
    tronWeb.setAddress(account.address);

    const sendTransaction = async <K extends keyof TransactionBuilder>(
        params: SendTransactionParams<K>
    ): Promise<BroadcastReturn<SignedTransaction>> => {
        const { type, parameters } = params;
        const method = tronWeb.transactionBuilder[type as keyof TransactionBuilder];
        if (typeof method !== 'function') {
            throw new Error(`Unknown transactionBuilder method: "${String(type)}"`);
        }

        // Build the unsigned transaction
        const result: any = await (method as (...args: any[]) => Promise<any>).apply(
            tronWeb.transactionBuilder,
            parameters as any[]
        );

        // Some methods return a TransactionWrapper ({ result, transaction }),
        // others return the Transaction object directly.
        const transaction = result?.transaction ?? result;

        if (!transaction || !transaction.txID) {
            throw new Error('transactionBuilder did not return a valid transaction object');
        }

        // Sign with the account (private key stays encapsulated)
        const signed = await account.signTransaction(transaction);

        // Broadcast
        return tronWeb.trx.sendRawTransaction(signed);
    };

    const getAddresses = async () => [account.address] as const;

    const requestAddresses = async () => getAddresses();

    const sendRawTransaction = async <TTransaction extends SignedTransaction = SignedTransaction>({
        transaction,
    }: SendRawTransactionParameters<TTransaction>) => tronWeb.trx.sendRawTransaction(transaction);

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
        feeLimit,
        tokenId,
        tokenValue,
        permissionId,
    }: WriteContractParameters<Abi, FunctionName>) => {
        const signerAddress = resolveSignerAddress(account, accountOverride);
        const fragment = getWriteContractFragment(abi, functionName);
        const callValue = resolveCallValue(value);
        const txWrapper = await tronWeb.transactionBuilder.triggerSmartContract(
            address,
            buildFunctionSelector(fragment),
            {
                ...(callValue !== undefined ? { callValue } : {}),
                ...(feeLimit !== undefined ? { feeLimit } : {}),
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
            throw new Error('transactionBuilder did not return a valid transaction object');
        }

        const signed = await account.signTransaction(txWrapper.transaction);
        const broadcast = await tronWeb.trx.sendRawTransaction(signed);

        if ((broadcast as any).code) {
            throw new Error(getBroadcastErrorMessage(tronWeb, broadcast as unknown as Record<string, unknown>));
        }

        return signed.txID;
    };

    const deployContract = async <Abi extends ContractAbiInterface>({
        abi,
        bytecode,
        args,
        account: accountOverride,
        name,
        value,
        feeLimit,
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
        const transaction = await tronWeb.transactionBuilder.createSmartContract(
            {
                abi,
                bytecode,
                ...(args !== undefined ? { parameters: [...args] } : {}),
                ...(name !== undefined ? { name } : {}),
                ...(callValue !== undefined ? { callValue } : {}),
                ...(feeLimit !== undefined ? { feeLimit } : {}),
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
            throw new Error('transactionBuilder did not return a valid transaction object');
        }

        const signed = await account.signTransaction(transaction);
        const broadcast = await tronWeb.trx.sendRawTransaction(signed);

        if ((broadcast as any).code) {
            throw new Error(getBroadcastErrorMessage(tronWeb, broadcast as unknown as Record<string, unknown>));
        }

        return signed.txID;
    };

    const metadata = createClientMetadata({
        key,
        name,
        defaultKey: 'wallet',
        defaultName: 'Wallet Client',
        type: 'walletClient',
    });
    const queryActions = createClientQueryActions({ chain, tronWeb, trx: tronWeb.trx });

    const client: WalletClient<TAccount> = {
        ...metadata,
        ...queryActions,
        get chain() {
            return chain;
        },
        get transport() {
            return transport;
        },
        get trx() {
            return tronWeb.trx;
        },
        get transactionBuilder() {
            return tronWeb.transactionBuilder;
        },
        get _tronWeb() {
            return tronWeb;
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
