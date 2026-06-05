import type {
    CallParameters,
    CallReturnType,
    EstimateContractGasParameters,
    EstimateContractGasReturnType,
    GetContractEventsParameters,
    GetContractEventsReturnType,
    GetLogsParameters,
    GetLogsReturnType,
    ReadContractParameters,
    ReadContractReturnType,
    PublicClientActions,
    VerifyMessageParameters,
    VerifyTypedDataParameters,
    EstimateContractGasFunctionName,
    ReadContractFunctionName,
} from './types.js';
import type { ContractAbiInterface, EventFragment, FunctionFragment } from '../types/ABI.js';
import type { Chain } from './chains.js';
import type { EventResponse } from '../types/Event.js';
import type { Hex } from '../accounts/types.js';
import type { TransactionWrapper } from '../types/Transaction.js';
import type { HttpProvider } from '../lib/providers/index.js';
import { buildFunctionSelector, decodeParamsV2ByABI, isReadOnlyFunctionFragment, resolveFunctionFragment } from '../utils/abi.js';
import { toUtf8 } from '../utils/bytes.js';
import { toHex } from '../utils/address.js';
import { verifyMessage as recoverMessageAddress } from '../utils/message.js';
import { verifyTypedData as recoverTypedDataAddress } from '../utils/typedData.js';
import { ADDRESS_PREFIX } from '../utils/constants.js';
import { parseEvent } from '../utils/validations.js';
import * as trxActions from '../lib/actions/trx.js';
import * as tbActions from '../lib/actions/transactionBuilder.js';
import * as eventActions from '../lib/actions/event.js';
import {
    resolveCallerAddress,
    resolveCallValue,
    resolveMessageInput,
    resolveAddressInput,
    resolveBlockInput,
    resolveBlockHashInput,
    resolveBlockNumberInput,
    resolveTransactionInput,
    resolveBlockTransactionCountInput,
    resolveTransactionHashInput,
} from './resolvers.js';

export interface CreateClientQueryActionsOptions {
    readonly chain?: Chain;
    readonly fullNode: HttpProvider;
    readonly solidityNode: HttpProvider;
    readonly eventServer?: HttpProvider;
    readonly feeLimit: number;
    readonly defaultAddress?: string;
}

function isTransactionInfoPopulated(value: unknown): boolean {
    return Boolean(value) && typeof value === 'object' && Object.keys(value as object).length > 0;
}

function isWriteFunctionFragment(fragment: FunctionFragment): boolean {
    return !isReadOnlyFunctionFragment(fragment);
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
    if (output.length === 1) {
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
            FunctionName extends EstimateContractGasFunctionName<Abi>,
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
            FunctionName extends ReadContractFunctionName<Abi>,
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
