import type { ContractAbiInterface, EventFragment, FunctionFragment, GetOnMethodTypeFromAbi, GetOutputsType, GetParamsType, IsConstAbi } from '../types/ABI.js';
import type {
    CollapseSingleItemTuple,
    EstimateContractGasParameters,
    EstimateContractGasReturnType,
    GetContractEventsParameters,
    GetContractEventsReturnType,
    PublicClient,
    ReadContractParameters,
    ReadContractReturnType,
    WalletClient,
    WriteContractParameters,
    WriteContractReturnType,
} from './types.js';
import { isReadOnlyFunctionFragment, overloadArities } from '../utils/abi.js';

// ─── Helper types ────────────────────────────────────────────────────────────

type ReservedContractInstanceKey = 'address' | 'abi' | 'read' | 'write' | 'estimateGas' | 'getEvents';

type ContractFunctionClient = PublicClient | WalletClient;

/** True if the fragment is a view or pure function (read-only, no state change) */
type IsReadOnly<F> = F extends FunctionFragment
    ? F['stateMutability'] extends 'view' | 'pure'
        ? true
        : F['constant'] extends true
            ? true
            : false
    : false;

type RemoveIndexSignature<T> = {
    [K in keyof T as string extends K
        ? never
        : number extends K
          ? never
          : symbol extends K
            ? never
            : K]: T[K];
};

type OnMethods<Abi extends ContractAbiInterface> = Omit<RemoveIndexSignature<GetOnMethodTypeFromAbi<Abi>>, ReservedContractInstanceKey>;

type ReadFunctionName<Abi extends ContractAbiInterface> = Abi[number] extends infer Fragment
    ? Fragment extends FunctionFragment
        ? IsReadOnly<Fragment> extends true
            ? Fragment['name']
            : never
        : never
    : never;

type WriteFunctionName<Abi extends ContractAbiInterface> = Abi[number] extends infer Fragment
    ? Fragment extends FunctionFragment
        ? IsReadOnly<Fragment> extends true
            ? never
            : Fragment['name']
        : never
    : never;

type EventName<Abi extends ContractAbiInterface> = Abi[number] extends infer Fragment
    ? Fragment extends EventFragment
        ? Fragment['name']
        : never
    : never;

type ReadOptions<
    Abi extends ContractAbiInterface,
    FunctionName extends ReadFunctionName<Abi>,
> = Omit<ReadContractParameters<Abi, FunctionName>, 'address' | 'abi' | 'functionName' | 'args'>;

type WriteOptions<
    Abi extends ContractAbiInterface,
    FunctionName extends WriteFunctionName<Abi>,
> = Omit<WriteContractParameters<Abi, FunctionName>, 'address' | 'abi' | 'functionName' | 'args'>;

type EstimateGasOptions<
    Abi extends ContractAbiInterface,
    FunctionName extends WriteFunctionName<Abi>,
> = Omit<EstimateContractGasParameters<Abi, FunctionName>, 'address' | 'abi' | 'functionName' | 'args'>;

type GetEventsOptions<
    Abi extends ContractAbiInterface,
    TEventName extends EventName<Abi>,
> = Omit<GetContractEventsParameters<Abi, TEventName>, 'address' | 'abi' | 'eventName' | 'args'>;

type ContractCallInterface = (...args: any[]) => Promise<any>;

type ContractReadNamespace<Abi extends ContractAbiInterface> = IsConstAbi<Abi> extends true
    ? {
        [K in ReadFunctionName<Abi>]: (
            argsOrOptions?: ReadContractParameters<Abi, K>['args'] | ReadOptions<Abi, K>,
            options?: ReadOptions<Abi, K>
        ) => Promise<ReadContractReturnType<Abi, K>>;
    }
    : Record<string, ContractCallInterface>;

type ContractWriteNamespace<Abi extends ContractAbiInterface> = IsConstAbi<Abi> extends true
    ? {
        [K in WriteFunctionName<Abi>]: (
            argsOrOptions?: WriteContractParameters<Abi, K>['args'] | WriteOptions<Abi, K>,
            options?: WriteOptions<Abi, K>
        ) => Promise<WriteContractReturnType>;
    }
    : Record<string, ContractCallInterface>;

type ContractEstimateGasNamespace<Abi extends ContractAbiInterface> = IsConstAbi<Abi> extends true
    ? {
        [K in WriteFunctionName<Abi>]: (
            argsOrOptions?: EstimateContractGasParameters<Abi, K>['args'] | EstimateGasOptions<Abi, K>,
            options?: EstimateGasOptions<Abi, K>
        ) => Promise<EstimateContractGasReturnType>;
    }
    : Record<string, ContractCallInterface>;

type ContractGetEventsNamespace<Abi extends ContractAbiInterface> = IsConstAbi<Abi> extends true
    ? {
        [K in EventName<Abi>]: (
            argsOrOptions?: GetContractEventsParameters<Abi, K>['args'] | readonly unknown[] | GetEventsOptions<Abi, K>,
            options?: GetEventsOptions<Abi, K>
        ) => Promise<GetContractEventsReturnType>;
    }
    : Record<string, ContractCallInterface>;

type GetAbiItemByName<Abi extends ContractAbiInterface, Name extends string | number | symbol> = Abi[number] extends infer F
    ? F extends { name: Name }
        ? F
        : never
    : never;

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

type WrapFragment<F extends FunctionFragment> = IsReadOnly<F> extends true
    ? (...args: GetParamsType<F['inputs']>) => Promise<CollapseSingleItemTuple<GetOutputsType<F['outputs']>>>
    : (...args: GetParamsType<F['inputs']>) => Promise<string>;

type FlatMethod<Abi extends ContractAbiInterface, K extends string | number | symbol> = UnionToIntersection<
    GetAbiItemByName<Abi, K> extends infer F ? (F extends FunctionFragment ? WrapFragment<F> : never) : never
>;

/**
 * The result type of `getContract` — every ABI function mapped to a
 * directly-callable async function (no `.call()` / `.send()` needed).
 */
type FlatContractFunctions<Abi extends ContractAbiInterface> = IsConstAbi<Abi> extends true
    ? { [K in keyof OnMethods<Abi>]: FlatMethod<Abi, K> }
    : Record<string, ContractCallInterface>;

export type ContractFunctions<
    Abi extends ContractAbiInterface,
    TClient extends ContractFunctionClient = ContractFunctionClient,
> = FlatContractFunctions<Abi> & {
    readonly address: string;
    readonly abi: Abi;
    readonly read: ContractReadNamespace<Abi>;
    readonly estimateGas: ContractEstimateGasNamespace<Abi>;
    readonly getEvents: ContractGetEventsNamespace<Abi>;
} & (TClient extends WalletClient ? { readonly write: ContractWriteNamespace<Abi> } : {});

// ─── Runtime ─────────────────────────────────────────────────────────────────

const RESERVED_CONTRACT_INSTANCE_KEYS = new Set<ReservedContractInstanceKey>([
    'address',
    'abi',
    'read',
    'write',
    'estimateGas',
    'getEvents',
]);

const EVENT_OPTION_KEYS = new Set([
    'blockNumber',
    'fingerprint',
    'limit',
    'maxBlockTimestamp',
    'minBlockTimestamp',
    'onlyConfirmed',
    'onlyUnconfirmed',
    'orderBy',
]);

function isWalletClient(client: ContractFunctionClient): client is WalletClient {
    return 'account' in client && typeof (client as WalletClient).sendTransaction === 'function';
}

function getFunctionParameters(values: [argsOrOptions?: readonly unknown[] | object, options?: object]) {
    const hasArgs = values.length > 0 && Array.isArray(values[0]);
    const args = hasArgs ? values[0]! : [];
    const options = (hasArgs ? values[1] : values[0]) ?? {};
    return { args, options };
}

function isEventOptions(value: unknown, fragment: EventFragment): boolean {
    if (!value || Array.isArray(value) || typeof value !== 'object') return false;
    const inputNames = new Set((fragment.inputs ?? []).map((input) => input.name).filter(Boolean) as string[]);
    const keys = Object.keys(value);
    // Treat the object as paging options only when every key is an option key AND none collides
    // with an indexed ABI input name — a collision (e.g. an event with an indexed `limit`) means
    // the caller is filtering by that input, so it must be read as args, not paging options.
    return keys.every((key) => EVENT_OPTION_KEYS.has(key)) && !keys.some((key) => inputNames.has(key));
}

function normalizeEventArgs(fragment: EventFragment, args: readonly unknown[] | Record<string, unknown> | undefined) {
    if (!args) return undefined;
    if (!Array.isArray(args)) return args;

    const inputs = fragment.inputs ?? [];
    const mapped: Record<string, unknown> = Object.create(null);

    args.forEach((value, index) => {
        const input = inputs[index];
        if (!input || !input.name) {
            throw new Error(`Event "${fragment.name}" args array requires named ABI inputs.`);
        }
        mapped[input.name] = value;
    });

    return mapped;
}

function getEventParameters(
    values: [argsOrOptions?: Record<string, unknown> | readonly unknown[] | object, options?: object],
    fragment: EventFragment
) {
    const first = values[0];
    const hasArgs = values[1] !== undefined || Array.isArray(first) || (Boolean(first) && typeof first === 'object' && !isEventOptions(first, fragment));
    const args = hasArgs ? normalizeEventArgs(fragment, first as readonly unknown[] | Record<string, unknown> | undefined) : undefined;
    const options = (hasArgs ? values[1] : first) ?? {};
    return { args, options };
}

/**
 * Create a type-safe contract wrapper.
 *
 * - `view`/`pure` methods are called with `.call()` automatically, returning the result directly.
 * - State-changing methods are built, signed with `client.account`, and broadcast, returning the txID.
 *
 * @param params.client   - A PublicClient (for read-only) or WalletClient (for read-write)
 * @param params.abi      - The contract ABI (use `as const` for full type inference)
 * @param params.address  - The contract address in base58Check format
 *
 * @example
 * ```ts
 * const contract = getContract({ client: walletClient, abi: MyABI, address: 'TXx...' });
 *
 * // view/pure method → returns result directly
 * const balance = await contract.balanceOf('TXx...');
 *
 * // state-changing method → signs and broadcasts, returns txID
 * const txId = await contract.transfer('TXx...', 1000n);
 * ```
 */
export function getContract<Abi extends ContractAbiInterface, TClient extends ContractFunctionClient>({
    client,
    abi,
    address,
}: {
    client: TClient;
    abi: Abi;
    address: string;
}): ContractFunctions<Abi, TClient> {
    const result: Record<string, unknown> = Object.create(null);
    const read: Record<string, unknown> = Object.create(null);
    const estimateGas: Record<string, unknown> = Object.create(null);
    const getEvents: Record<string, unknown> = Object.create(null);
    const write: Record<string, unknown> = Object.create(null);

    const assertArgCount = (functionName: string, args: readonly unknown[] | undefined): void => {
        // Overload-aware: accept the call if its arg count matches ANY overload's
        // arity (the correct overload is then selected from the args downstream).
        const arities = overloadArities(abi, functionName);
        if (arities.length === 0) return;
        const actual = Array.isArray(args) ? args.length : 0;
        if (!arities.includes(actual)) {
            const expected = arities.join(' or ');
            throw new Error(`Contract function "${functionName}" expects ${expected} argument(s) but received ${actual}.`);
        }
    };

    const invokeRead = <FunctionName extends ReadFunctionName<Abi>>(
        functionName: FunctionName,
        args: ReadContractParameters<Abi, FunctionName>['args'],
        options?: ReadOptions<Abi, FunctionName>
    ) => {
        assertArgCount(functionName, args as readonly unknown[] | undefined);
        return client.readContract({
            address,
            abi,
            functionName,
            args,
            ...(options as object),
        } as ReadContractParameters<Abi, FunctionName>);
    };

    const invokeWrite = <FunctionName extends WriteFunctionName<Abi>>(
        functionName: FunctionName,
        args: WriteContractParameters<Abi, FunctionName>['args'],
        options?: WriteOptions<Abi, FunctionName>
    ) => {
        if (!isWalletClient(client)) {
            throw new Error(
                `Method "${String(functionName)}" modifies state and requires a WalletClient. Use createWalletClient() instead of createPublicClient().`
            );
        }

        assertArgCount(functionName, args as readonly unknown[] | undefined);
        return client.writeContract({
            address,
            abi,
            functionName,
            args,
            ...(options as object),
        } as WriteContractParameters<Abi, FunctionName>);
    };

    const invokeEstimateGas = <FunctionName extends WriteFunctionName<Abi>>(
        functionName: FunctionName,
        args: EstimateContractGasParameters<Abi, FunctionName>['args'],
        options?: EstimateGasOptions<Abi, FunctionName>
    ) => {
        assertArgCount(functionName, args as readonly unknown[] | undefined);
        return client.estimateContractGas({
            address,
            abi,
            functionName,
            args,
            ...(options as object),
        } as EstimateContractGasParameters<Abi, FunctionName>);
    };

    const invokeGetEvents = <TEventName extends EventName<Abi>>(
        eventName: TEventName,
        args: GetContractEventsParameters<Abi, TEventName>['args'],
        options?: GetEventsOptions<Abi, TEventName>
    ) => {
        return client.getContractEvents({
            address,
            abi,
            eventName,
            ...(args !== undefined ? { args } : {}),
            ...(options as object),
        } as GetContractEventsParameters<Abi, TEventName>);
    };

    result.address = address;
    result.abi = abi;
    result.read = read;
    result.estimateGas = estimateGas;
    result.getEvents = getEvents;
    if (isWalletClient(client)) {
        result.write = write;
    }

    for (const fragment of abi) {
        if (fragment.type === 'function' && 'name' in fragment) {
            const name = fragment.name;
            const writeFunctionName = name as WriteFunctionName<Abi>;
            const readFunctionName = name as ReadFunctionName<Abi>;
            const readOnly = isReadOnlyFunctionFragment(fragment as FunctionFragment);

            if (readOnly) {
                read[name] = (
                    argsOrOptions?: ReadContractParameters<Abi, typeof readFunctionName>['args'] | ReadOptions<Abi, typeof readFunctionName>,
                    options?: ReadOptions<Abi, typeof readFunctionName>
                ) => {
                    const parameters = getFunctionParameters([argsOrOptions as readonly unknown[] | object | undefined, options]);
                    return invokeRead(readFunctionName, parameters.args as ReadContractParameters<Abi, typeof readFunctionName>['args'], parameters.options as ReadOptions<Abi, typeof readFunctionName>);
                };

                if (!RESERVED_CONTRACT_INSTANCE_KEYS.has(name as ReservedContractInstanceKey)) {
                    result[name] = (...args: unknown[]) => invokeRead(readFunctionName, args as ReadContractParameters<Abi, typeof readFunctionName>['args']);
                }
            } else {
                estimateGas[name] = (
                    argsOrOptions?: EstimateContractGasParameters<Abi, typeof writeFunctionName>['args'] | EstimateGasOptions<Abi, typeof writeFunctionName>,
                    options?: EstimateGasOptions<Abi, typeof writeFunctionName>
                ) => {
                    const parameters = getFunctionParameters([argsOrOptions as readonly unknown[] | object | undefined, options]);
                    return invokeEstimateGas(
                        writeFunctionName,
                        parameters.args as EstimateContractGasParameters<Abi, typeof writeFunctionName>['args'],
                        parameters.options as EstimateGasOptions<Abi, typeof writeFunctionName>
                    );
                };

                if (isWalletClient(client)) {
                    write[name] = (
                        argsOrOptions?: WriteContractParameters<Abi, typeof writeFunctionName>['args'] | WriteOptions<Abi, typeof writeFunctionName>,
                        options?: WriteOptions<Abi, typeof writeFunctionName>
                    ) => {
                        const parameters = getFunctionParameters([argsOrOptions as readonly unknown[] | object | undefined, options]);
                        return invokeWrite(
                            writeFunctionName,
                            parameters.args as WriteContractParameters<Abi, typeof writeFunctionName>['args'],
                            parameters.options as WriteOptions<Abi, typeof writeFunctionName>
                        );
                    };
                }

                if (!RESERVED_CONTRACT_INSTANCE_KEYS.has(name as ReservedContractInstanceKey)) {
                    result[name] = (...args: unknown[]) => invokeWrite(writeFunctionName, args as WriteContractParameters<Abi, typeof writeFunctionName>['args']);
                }
            }
        } else if (fragment.type === 'event' && 'name' in fragment) {
            const eventName = fragment.name as EventName<Abi>;
            getEvents[eventName] = (
                argsOrOptions?: GetContractEventsParameters<Abi, typeof eventName>['args'] | readonly unknown[] | GetEventsOptions<Abi, typeof eventName>,
                options?: GetEventsOptions<Abi, typeof eventName>
            ) => {
                const parameters = getEventParameters([argsOrOptions as Record<string, unknown> | readonly unknown[] | object | undefined, options], fragment as EventFragment);
                return invokeGetEvents(
                    eventName,
                    parameters.args as GetContractEventsParameters<Abi, typeof eventName>['args'],
                    parameters.options as GetEventsOptions<Abi, typeof eventName>
                );
            };
        }
    }

    return result as unknown as ContractFunctions<Abi, TClient>;
}

export const createContract = getContract;
