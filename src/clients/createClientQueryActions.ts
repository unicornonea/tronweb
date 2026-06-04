import type {
    CallParameters,
    CallReturnType,
    EstimateContractGasParameters,
    EstimateContractGasReturnType,
    GetContractEventsParameters,
    GetContractEventsReturnType,
    GetBlockParameters,
    GetBlockTransactionCountParameters,
    GetLogsParameters,
    GetLogsReturnType,
    ReadContractParameters,
    ReadContractReturnType,
    GetTransactionParameters,
    GetTransactionReceiptParameters,
    PublicClientActions,
    VerifyMessageParameters,
    VerifyTypedDataParameters,
    WaitForTransactionReceiptParameters,
} from './types.js';
import type { ContractAbiInterface, EventFragment, FunctionFragment } from '../types/ABI.js';
import type { Chain } from '../chains/index.js';
import type { EventResponse } from '../types/Event.js';
import type { Hex, SignableMessage } from '../accounts/types.js';
import type { TransactionWrapper } from '../types/Transaction.js';
import type { HttpProvider } from '../lib/providers/index.js';
import { buildFunctionSelector, decodeParamsV2ByABI, resolveFunctionFragment } from '../utils/abi.js';
import { hexToBytes, toUtf8 } from '../utils/bytes.js';
import { toHex } from '../utils/address.js';
import { verifyMessage as recoverMessageAddress } from '../utils/message.js';
import { verifyTypedData as recoverTypedDataAddress } from '../utils/typedData.js';
import { ADDRESS_PREFIX } from '../utils/constants.js';
import { parseEvent } from '../utils/validations.js';
import * as trxActions from '../lib/actions/trx.js';
import * as tbActions from '../lib/actions/transactionBuilder.js';
import * as eventActions from '../lib/actions/event.js';

export interface CreateClientQueryActionsOptions {
    readonly chain?: Chain;
    readonly fullNode: HttpProvider;
    readonly solidityNode: HttpProvider;
    readonly eventServer?: HttpProvider;
    readonly feeLimit: number;
    readonly defaultAddress?: string;
}

const NULL_CALLER_ADDRESS = `${ADDRESS_PREFIX}${'0'.repeat(40)}`;

function normalizeRawMessage(raw: Hex | Uint8Array): Uint8Array {
    if (raw instanceof Uint8Array) return raw;
    if (!/^0x[0-9a-fA-F]+$/.test(raw)) {
        throw new Error('Invalid raw message: must be a 0x-prefixed hex string or Uint8Array');
    }
    // raw.length includes the even-length '0x' prefix, so its parity matches the hex digit count.
    if (raw.length % 2 !== 0) {
        throw new Error('Invalid raw message: hex string must have an even number of digits');
    }
    return hexToBytes(raw.slice(2));
}

function isRawMessageInput(
    message: VerifyMessageParameters['message']
): message is Extract<SignableMessage, { readonly raw: Hex | Uint8Array }> {
    return typeof message === 'object' && message !== null && !Array.isArray(message) && 'raw' in message;
}

function resolveMessageInput(message: VerifyMessageParameters['message']): string | Uint8Array {
    if (typeof message === 'string') return message;
    if (isRawMessageInput(message)) return normalizeRawMessage(message.raw);
    throw new Error('Invalid message input');
}

function isTransactionInfoPopulated(value: unknown): boolean {
    return Boolean(value) && typeof value === 'object' && Object.keys(value as object).length > 0;
}

function isReadOnlyFunctionFragment(fragment: FunctionFragment): boolean {
    const stateMutability = (fragment.stateMutability ?? '').toLowerCase();
    return stateMutability === 'view' || stateMutability === 'pure' || fragment.constant === true;
}

function isWriteFunctionFragment(fragment: FunctionFragment): boolean {
    return !isReadOnlyFunctionFragment(fragment);
}

function resolveCallerAddress(account: string | undefined, defaultAddress?: string): string {
    if (typeof account === 'string' && account.length > 0) return account;
    if (typeof defaultAddress === 'string' && defaultAddress.length > 0) return defaultAddress;
    return NULL_CALLER_ADDRESS;
}

function resolveCallValue(value: number | bigint | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'bigint') {
        // Number(bigint) silently loses precision above 2^53; reject rather than truncate.
        if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error('call value exceeds safe integer range');
        }
        return Number(value);
    }
    return value;
}

function extractConstantResultData(transaction: TransactionWrapper): Hex | undefined {
    const constantResult = Array.isArray(transaction.constant_result)
        ? transaction.constant_result[0]
        : transaction.constant_result;

    if (constantResult === undefined || constantResult === null || constantResult === '') return undefined;
    if (typeof constantResult !== 'string') {
        throw new Error('Invalid constant call result');
    }

    const normalized = constantResult.replace(/^0x/, '');
    const len = normalized.length;

    if (len !== 0 && len % 64 === 8) {
        let message = 'The call has been reverted or has thrown an error.';
        const chunk = normalized.substring(8);

        if (chunk.length > 0) {
            let decoded = '';
            for (let index = 0; index < chunk.length; index += 64) {
                decoded += toUtf8(chunk.substring(index, index + 64));
            }
            message += ` Error message: ${decoded
                .replace(/(\u0000|\u000b|\f)+/g, ' ')
                .replace(/ +/g, ' ')
                .replace(/\s+$/g, '')}`;
        }

        throw new Error(message);
    }

    return `0x${normalized}` as Hex;
}

function getReadContractFragment<
    Abi extends ContractAbiInterface,
    FunctionName extends ReadContractParameters<Abi>['functionName'],
>(abi: Abi, functionName: FunctionName, args: readonly unknown[] | undefined): FunctionFragment {
    const fragment = resolveFunctionFragment(abi, functionName as string, args);

    if (!isReadOnlyFunctionFragment(fragment)) {
        throw new Error(`Function "${String(functionName)}" is not read-only.`);
    }

    return fragment;
}

function getEstimateContractGasFragment<
    Abi extends ContractAbiInterface,
    FunctionName extends EstimateContractGasParameters<Abi>['functionName'],
>(abi: Abi, functionName: FunctionName, args: readonly unknown[] | undefined): FunctionFragment {
    const fragment = resolveFunctionFragment(abi, functionName as string, args);

    if (!isWriteFunctionFragment(fragment)) {
        throw new Error(`Function "${String(functionName)}" is read-only.`);
    }

    return fragment;
}

function normalizeReadContractOutput(fragment: FunctionFragment, data: Hex | undefined) {
    if (!data) {
        if (fragment.outputs && fragment.outputs.length > 0) {
            throw new Error('Failed to execute');
        }
        return undefined;
    }

    const output = decodeParamsV2ByABI(fragment, data) as any[];
    if (output.length === 1 && Object.keys(output).length === 1) {
        return output[0];
    }

    return output;
}

function cloneEventLog(log: GetLogsReturnType['data'][number]): GetLogsReturnType['data'][number] {
    return {
        ...log,
        result:
            log.result && typeof log.result === 'object' && !Array.isArray(log.result)
                ? { ...log.result }
                : log.result,
        result_type:
            log.result_type && typeof log.result_type === 'object' && !Array.isArray(log.result_type)
                ? { ...log.result_type }
                : log.result_type,
    };
}

function toEventQueryReturn(
    response: EventResponse,
    data: GetLogsReturnType['data'] = response.data ? response.data.map((item) => cloneEventLog(item)) : []
): GetLogsReturnType {
    return {
        data,
        ...(response.meta ? { meta: response.meta } : {}),
    };
}

function getContractEventFragments(abi: ContractAbiInterface): Map<string, EventFragment> {
    const fragments = new Map<string, EventFragment>();

    for (const fragment of abi) {
        if (fragment.type === 'event' && 'name' in fragment) {
            fragments.set(fragment.name, fragment as EventFragment);
        }
    }

    return fragments;
}

function normalizeContractEventLog(
    log: GetLogsReturnType['data'][number],
    fragment: EventFragment
): GetLogsReturnType['data'][number] {
    return parseEvent(cloneEventLog(log) as any, { inputs: fragment.inputs ?? [] }) as unknown as GetLogsReturnType['data'][number];
}

function matchesContractEventArgs(
    log: GetLogsReturnType['data'][number],
    fragment: EventFragment,
    args: NonNullable<GetContractEventsParameters['args']>
): boolean {
    if (!log.result || typeof log.result !== 'object' || Array.isArray(log.result)) {
        return false;
    }

    const result = log.result as Record<string, unknown>;

    return Object.entries(args).every(([key, expected]) => {
        const actual = result[key];
        if (actual === undefined) return false;

        const input = (fragment.inputs ?? []).find((item) => item.name === key);
        if (input?.type === 'address' && typeof actual === 'string' && typeof expected === 'string') {
            return toHex(actual).toLowerCase() === toHex(expected).toLowerCase();
        }

        return String(actual) === String(expected);
    });
}

function resolveAddressInput(
    input: Parameters<PublicClientActions['getAccount']>[0] | Parameters<PublicClientActions['getBalance']>[0],
    methodName: 'getAccount' | 'getBalance',
    defaultAddress?: string
): string {
    // No explicit address → fall back to the configured (wallet) address, matching legacy
    // trx.getAccount/getBalance(address = tronWeb.defaultAddress.hex).
    if (input === undefined && typeof defaultAddress === 'string' && defaultAddress.length > 0) {
        return defaultAddress;
    }
    if (input === undefined || input === false || typeof input === 'string') return input as string;
    if (!('address' in input) || typeof input.address !== 'string') {
        throw new Error(`${methodName} requires either an address string or { address }.`);
    }
    return input.address;
}

function resolveBlockInput(
    input: Parameters<PublicClientActions['getBlock']>[0]
): 'earliest' | 'latest' | number | string | false {
    if (input === undefined) return 'latest';
    if (input === false || typeof input === 'string' || typeof input === 'number') return input;

    const parameters = input as GetBlockParameters;
    const entries = [
        ['blockHash', parameters.blockHash],
        ['blockNumber', parameters.blockNumber],
        ['blockTag', parameters.blockTag],
    ].filter(([, value]) => value !== undefined);

    if (entries.length !== 1) {
        throw new Error('getBlock requires exactly one of blockHash, blockNumber, or blockTag when using object-style input.');
    }

    return entries[0][1] as 'earliest' | 'latest' | number | string;
}

function resolveBlockTransactionCountInput(
    input: GetBlockTransactionCountParameters | undefined
): 'earliest' | 'latest' | number | string | false {
    if (!input) return 'latest';

    const entries = [
        ['blockHash', input.blockHash],
        ['blockNumber', input.blockNumber],
        ['blockTag', input.blockTag],
    ].filter(([, value]) => value !== undefined);

    if (entries.length === 0) return 'latest';

    if (entries.length !== 1) {
        throw new Error('getBlockTransactionCount requires at most one of blockHash, blockNumber, or blockTag.');
    }

    return entries[0][1] as 'earliest' | 'latest' | number | string;
}

function resolveBlockHashInput(input: Parameters<PublicClientActions['getBlockByHash']>[0]): string {
    if (typeof input === 'string') return input;
    if (!('blockHash' in input) || typeof input.blockHash !== 'string') {
        throw new Error('getBlockByHash requires either a block hash string or { blockHash }.');
    }
    return input.blockHash;
}

function resolveBlockNumberInput(input: Parameters<PublicClientActions['getBlockByNumber']>[0]): number {
    if (typeof input === 'number') return input;
    if (!('blockNumber' in input) || typeof input.blockNumber !== 'number') {
        throw new Error('getBlockByNumber requires either a block number or { blockNumber }.');
    }
    return input.blockNumber;
}

function resolveTransactionInput(
    input:
        | Parameters<PublicClientActions['getTransaction']>[0]
        | Parameters<PublicClientActions['getTransactionInfo']>[0]
        | Parameters<PublicClientActions['getTransactionReceipt']>[0]
        | WaitForTransactionReceiptParameters,
    methodName: 'getTransaction' | 'getTransactionInfo' | 'getTransactionReceipt' | 'waitForTransactionReceipt'
): string {
    if (typeof input === 'string') return input;

    const parameters = input as GetTransactionParameters;
    const transactionId = parameters.txId ?? parameters.hash;

    if (typeof transactionId !== 'string') {
        throw new Error(`${methodName} requires either a transaction id string or { txId } / { hash }.`);
    }

    if (parameters.txId && parameters.hash && parameters.txId !== parameters.hash) {
        throw new Error(`${methodName} received conflicting txId and hash values.`);
    }

    return transactionId;
}

function resolveTransactionHashInput(
    input: GetTransactionReceiptParameters | WaitForTransactionReceiptParameters,
    methodName: 'getTransactionReceipt' | 'waitForTransactionReceipt'
): string {
    if (!input || typeof input.hash !== 'string') {
        throw new Error(`${methodName} requires { hash }.`);
    }

    return input.hash;
}

export function createClientQueryActions({
    chain,
    fullNode,
    solidityNode,
    eventServer,
    feeLimit,
    defaultAddress,
}: CreateClientQueryActionsOptions): PublicClientActions {
    const requireEventServer = (methodName: string): HttpProvider => {
        if (!eventServer) {
            throw new Error(`${methodName} requires an eventServer to be configured`);
        }
        return eventServer;
    };

    return {
        call: async ({ account, data, to, value }: CallParameters): Promise<CallReturnType> => {
            const transaction = await tbActions.triggerConstantContract(
                fullNode,
                solidityNode,
                to,
                '',
                {
                    feeLimit,
                    ...(data ? { input: data } : {}),
                    ...(value !== undefined ? { callValue: resolveCallValue(value) } : {}),
                },
                [],
                resolveCallerAddress(account, defaultAddress)
            );

            return {
                data: extractConstantResultData(transaction),
            };
        },
        estimateContractGas: async <
            Abi extends ContractAbiInterface,
            FunctionName extends EstimateContractGasParameters<Abi>['functionName'],
        >({
            abi,
            account,
            address,
            args = [] as unknown as EstimateContractGasParameters<Abi, FunctionName>['args'],
            functionName,
            value,
        }: EstimateContractGasParameters<Abi, FunctionName>): Promise<EstimateContractGasReturnType> => {
            const fragment = getEstimateContractGasFragment(abi, functionName, args);
            const estimate = await tbActions.estimateEnergy(
                fullNode,
                solidityNode,
                address,
                buildFunctionSelector(fragment),
                {
                    feeLimit,
                    ...(value !== undefined ? { callValue: resolveCallValue(value) } : {}),
                    funcABIV2: fragment,
                    parametersV2: [...(args ?? [])],
                },
                [],
                resolveCallerAddress(account, defaultAddress)
            );

            if (!estimate.result?.result || typeof estimate.energy_required !== 'number') {
                throw new Error('Failed to estimate contract energy.');
            }

            return BigInt(estimate.energy_required);
        },
        getContractEvents: async <Abi extends ContractAbiInterface>({
            abi,
            address,
            args,
            eventName,
            ...options
        }: GetContractEventsParameters<Abi>): Promise<GetContractEventsReturnType> => {
            if (args && Object.keys(args).length > 0 && !eventName) {
                throw new Error('getContractEvents requires eventName when filtering args.');
            }

            const response = await eventActions.getEventsByContractAddress(
                requireEventServer('getContractEvents'),
                address,
                {
                    ...options,
                    ...(eventName ? { eventName: String(eventName) } : {}),
                }
            );

            const fragments = getContractEventFragments(abi);
            const normalizedData = (response.data ?? []).map((log) => {
                const fragment = fragments.get(log.event_name);
                return fragment ? normalizeContractEventLog(log, fragment) : cloneEventLog(log);
            });

            const filteredData =
                args && Object.keys(args).length > 0
                    ? normalizedData.filter((log) => {
                          const fragment = fragments.get(log.event_name);
                          return fragment ? matchesContractEventArgs(log, fragment, args) : false;
                      })
                    : normalizedData;

            return toEventQueryReturn(response, filteredData);
        },
        getAccount: (input) => trxActions.getAccount(solidityNode, resolveAddressInput(input, 'getAccount', defaultAddress)),
        getBalance: (input) => trxActions.getBalance(solidityNode, resolveAddressInput(input, 'getBalance', defaultAddress)),
        getBlock: (input) => trxActions.getBlock(fullNode, resolveBlockInput(input)),
        getBlockByHash: (input) => trxActions.getBlockByHash(fullNode, resolveBlockHashInput(input)),
        getBlockByNumber: (input) => trxActions.getBlockByNumber(fullNode, resolveBlockNumberInput(input)),
        getBlockTransactionCount: (input) =>
            trxActions.getBlockTransactionCount(fullNode, resolveBlockTransactionCountInput(input)),
        getChainId: async () => {
            if (typeof chain?.id !== 'number') {
                throw new Error('getChainId requires a configured chain.');
            }
            return chain.id;
        },
        getLogs: async ({ address, ...options }: GetLogsParameters): Promise<GetLogsReturnType> => {
            const response = await eventActions.getEventsByContractAddress(
                requireEventServer('getLogs'),
                address,
                options
            );
            return toEventQueryReturn(response);
        },
        getBlockNumber: async () => {
            const block = await trxActions.getCurrentBlock(fullNode);
            return block.block_header.raw_data.number;
        },
        getTransaction: (input) => trxActions.getTransaction(fullNode, resolveTransactionInput(input, 'getTransaction')),
        getTransactionInfo: (input) =>
            trxActions.getTransactionInfo(solidityNode, resolveTransactionInput(input, 'getTransactionInfo')),
        getTransactionReceipt: async (input) =>
            trxActions.getTransactionInfo(solidityNode, resolveTransactionHashInput(input, 'getTransactionReceipt')),
        waitForTransactionReceipt: async (input) => {
            const txId = resolveTransactionHashInput(input, 'waitForTransactionReceipt');
            const pollingInterval = input.pollingInterval ?? 1_000;
            const timeout = input.timeout ?? 60_000;
            const startedAt = Date.now();
            let lastError: unknown;

            while (true) {
                try {
                    const receipt = await trxActions.getTransactionInfo(solidityNode, txId);
                    if (isTransactionInfoPopulated(receipt)) return receipt;
                } catch (error) {
                    lastError = error;
                }

                if (Date.now() - startedAt >= timeout) {
                    const lastErrorMessage =
                        lastError instanceof Error
                            ? lastError.message
                            : lastError !== undefined
                              ? String(lastError)
                              : undefined;
                    const suffix = lastErrorMessage ? ` Last error: ${lastErrorMessage}` : '';
                    throw new Error(`Timed out waiting for transaction receipt for "${txId}".${suffix}`);
                }

                await new Promise((resolve) => setTimeout(resolve, pollingInterval));
            }
        },
        readContract: async <
            Abi extends ContractAbiInterface,
            FunctionName extends ReadContractParameters<Abi>['functionName'],
        >({
            abi,
            account,
            address,
            args = [] as unknown as ReadContractParameters<Abi, FunctionName>['args'],
            functionName,
            value,
        }: ReadContractParameters<Abi, FunctionName>): Promise<ReadContractReturnType<Abi, FunctionName>> => {
            const fragment = getReadContractFragment(abi, functionName, args);
            const transaction = await tbActions.triggerConstantContract(
                fullNode,
                solidityNode,
                address,
                buildFunctionSelector(fragment),
                {
                    feeLimit,
                    ...(value !== undefined ? { callValue: resolveCallValue(value) } : {}),
                    funcABIV2: fragment,
                    parametersV2: [...(args ?? [])],
                },
                [],
                resolveCallerAddress(account, defaultAddress)
            );

            return normalizeReadContractOutput(
                fragment,
                extractConstantResultData(transaction)
            ) as ReadContractReturnType<Abi, FunctionName>;
        },
        verifyMessage: async ({ address, message, signature }: VerifyMessageParameters) => {
            return toHex(recoverMessageAddress(resolveMessageInput(message), signature)).toLowerCase() === toHex(address).toLowerCase();
        },
        verifyTypedData: async ({ address, domain = {}, types, message, signature }: VerifyTypedDataParameters) => {
            const recovered = recoverTypedDataAddress(domain, types as any, message, signature);
            const recoveredAddress = `${ADDRESS_PREFIX}${recovered.slice(2)}`;
            return recoveredAddress.toLowerCase() === toHex(address).toLowerCase();
        },
    };
}
