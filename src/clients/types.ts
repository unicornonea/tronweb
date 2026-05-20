import type { TronWeb } from '../tronweb.js';
import type { TransactionBuilder } from '../lib/TransactionBuilder/TransactionBuilder.js';
import type { Trx } from '../lib/trx.js';
import type { Hex, SignTypedDataParameters, SignableMessage, WalletAccount } from '../accounts/types.js';
import type { Chain } from '../chains/index.js';
import type { Transport } from '../transports/index.js';
import type { ContractAbiInterface, EventFragment, FunctionFragment, GetOutputsType, GetParamsType } from '../types/ABI.js';
import type { EventResponse, GetEventResultOptions } from '../types/Event.js';
import type { SignedTransaction } from '../types/Transaction.js';
import type { TronWebOptions } from '../types/TronWeb.js';
import type { BroadcastReturn, TransactionInfo } from '../types/Trx.js';
import type { ClientType } from './createClientMetadata.js';

export const PUBLIC_CLIENT_BLOCKED_TRX_METHODS = [
    '_signTypedData',
    'broadcast',
    'broadcastHex',
    'freezeBalance',
    'multiSign',
    'send',
    'sendAsset',
    'sendHexTransaction',
    'sendRawTransaction',
    'sendToken',
    'sendTransaction',
    'sendTrx',
    'sign',
    'signMessage',
    'signMessageV2',
    'signTransaction',
    'signTypedData',
    'unfreezeBalance',
    'updateAccount',
] as const;

export type PublicClientBlockedTrxMethod = (typeof PUBLIC_CLIENT_BLOCKED_TRX_METHODS)[number];

export type PublicClientTrx = Omit<Trx, PublicClientBlockedTrxMethod>;

export type PublicClientQueryTrx = Pick<
    Trx,
    | 'getAccount'
    | 'getBalance'
    | 'getBlock'
    | 'getBlockByHash'
    | 'getBlockByNumber'
    | 'getBlockTransactionCount'
    | 'getCurrentBlock'
    | 'getTransaction'
    | 'getTransactionInfo'
>;

export interface GetAccountParameters {
    readonly address: string;
}

export interface GetBalanceParameters {
    readonly address: string;
}

export interface GetBlockParameters {
    readonly blockHash?: string;
    readonly blockNumber?: number;
    readonly blockTag?: 'earliest' | 'latest';
}

export interface GetBlockByHashParameters {
    readonly blockHash: string;
}

export interface GetBlockByNumberParameters {
    readonly blockNumber: number;
}

export interface GetBlockTransactionCountParameters {
    readonly blockHash?: string;
    readonly blockNumber?: number;
    readonly blockTag?: 'earliest' | 'latest';
}

export interface GetTransactionParameters {
    readonly hash?: string;
    readonly txId?: string;
}

export interface GetTransactionReceiptParameters {
    readonly hash: string;
}

export interface WaitForTransactionReceiptParameters extends GetTransactionReceiptParameters {
    readonly pollingInterval?: number;
    readonly timeout?: number;
}

export interface VerifyMessageParameters {
    readonly address: string;
    readonly message: SignableMessage;
    readonly signature: Hex | string;
}

export interface VerifyTypedDataParameters extends SignTypedDataParameters {
    readonly address: string;
    readonly signature: Hex | string;
}

export interface CallParameters {
    readonly to: string;
    readonly data?: Hex;
    readonly account?: string;
    readonly value?: number | bigint;
}

export interface CallReturnType {
    readonly data?: Hex;
}

type IsReadOnlyFunction<Fragment> = Fragment extends FunctionFragment
    ? Fragment['stateMutability'] extends 'view' | 'pure'
        ? true
        : Fragment['constant'] extends true
          ? true
          : false
    : false;

type IsWriteFunction<Fragment> = Fragment extends FunctionFragment
    ? IsReadOnlyFunction<Fragment> extends true
        ? false
        : true
    : false;

type ReadContractFunctionName<Abi extends ContractAbiInterface> = Abi[number] extends infer Fragment
    ? Fragment extends FunctionFragment
        ? IsReadOnlyFunction<Fragment> extends true
            ? Fragment['name']
            : never
        : never
    : never;

type EstimateContractGasFunctionName<Abi extends ContractAbiInterface> = Abi[number] extends infer Fragment
    ? Fragment extends FunctionFragment
        ? IsWriteFunction<Fragment> extends true
            ? Fragment['name']
            : never
        : never
    : never;

type ContractEventName<Abi extends ContractAbiInterface> = Abi[number] extends infer Fragment
    ? Fragment extends EventFragment
        ? Fragment['name']
        : never
    : never;

type ReadContractFragment<
    Abi extends ContractAbiInterface,
    FunctionName extends ReadContractFunctionName<Abi>,
> = Extract<Abi[number], { type: 'function'; name: FunctionName }> extends infer Fragment
    ? Fragment extends FunctionFragment
        ? Fragment
        : never
    : never;

type ReadContractInputs<
    Abi extends ContractAbiInterface,
    FunctionName extends ReadContractFunctionName<Abi>,
> = ReadContractFragment<Abi, FunctionName> extends FunctionFragment
    ? ReadContractFragment<Abi, FunctionName>['inputs']
    : undefined;

type ReadContractOutputs<
    Abi extends ContractAbiInterface,
    FunctionName extends ReadContractFunctionName<Abi>,
> = ReadContractFragment<Abi, FunctionName> extends FunctionFragment
    ? ReadContractFragment<Abi, FunctionName>['outputs']
    : undefined;

type CollapseSingleItemTuple<Value> = Value extends readonly [infer Only] ? Only : Value;

export type ReadContractParameters<
    Abi extends ContractAbiInterface = ContractAbiInterface,
    FunctionName extends ReadContractFunctionName<Abi> = ReadContractFunctionName<Abi>,
> = {
    readonly address: string;
    readonly abi: Abi;
    readonly functionName: FunctionName;
    readonly args?: GetParamsType<ReadContractInputs<Abi, FunctionName>>;
    readonly account?: string;
    readonly value?: number | bigint;
};

export type ReadContractReturnType<
    Abi extends ContractAbiInterface = ContractAbiInterface,
    FunctionName extends ReadContractFunctionName<Abi> = ReadContractFunctionName<Abi>,
> = CollapseSingleItemTuple<GetOutputsType<ReadContractOutputs<Abi, FunctionName>>>;

export type EstimateContractGasParameters<
    Abi extends ContractAbiInterface = ContractAbiInterface,
    FunctionName extends EstimateContractGasFunctionName<Abi> = EstimateContractGasFunctionName<Abi>,
> = {
    readonly address: string;
    readonly abi: Abi;
    readonly functionName: FunctionName;
    readonly args?: GetParamsType<ReadContractInputs<Abi, FunctionName>>;
    readonly account?: string;
    readonly value?: number | bigint;
};

export type EstimateContractGasReturnType = bigint;

export type EventLog = NonNullable<EventResponse['data']>[number];

export type GetLogsParameters = Readonly<
    GetEventResultOptions & {
        readonly address: string;
    }
>;

export interface GetLogsReturnType {
    readonly data: EventLog[];
    readonly meta?: EventResponse['meta'];
}

export type GetContractEventsParameters<
    Abi extends ContractAbiInterface = ContractAbiInterface,
    EventName extends ContractEventName<Abi> = ContractEventName<Abi>,
> = Readonly<
    GetEventResultOptions & {
        readonly address: string;
        readonly abi: Abi;
        readonly eventName?: EventName;
        readonly args?: Record<string, string | number | bigint | boolean>;
    }
>;

export type GetContractEventsReturnType = GetLogsReturnType;

export interface ClientMetadata {
    readonly key: string;
    readonly name: string;
    readonly type: ClientType;
    readonly uid: string;
}

export interface PublicClientActions {
    readonly call: (input: CallParameters) => Promise<CallReturnType>;
    readonly estimateContractGas: <
        Abi extends ContractAbiInterface,
        FunctionName extends EstimateContractGasFunctionName<Abi>,
    >(
        input: EstimateContractGasParameters<Abi, FunctionName>
    ) => Promise<EstimateContractGasReturnType>;
    readonly getContractEvents: <
        Abi extends ContractAbiInterface,
        EventName extends ContractEventName<Abi>,
    >(
        input: GetContractEventsParameters<Abi, EventName>
    ) => Promise<GetContractEventsReturnType>;
    readonly getAccount: (
        input?: Parameters<PublicClientQueryTrx['getAccount']>[0] | GetAccountParameters
    ) => ReturnType<PublicClientQueryTrx['getAccount']>;
    readonly getBalance: (
        input?: Parameters<PublicClientQueryTrx['getBalance']>[0] | GetBalanceParameters
    ) => ReturnType<PublicClientQueryTrx['getBalance']>;
    readonly getBlock: (
        input?: Parameters<PublicClientQueryTrx['getBlock']>[0] | GetBlockParameters
    ) => ReturnType<PublicClientQueryTrx['getBlock']>;
    readonly getBlockByHash: (
        input: Parameters<PublicClientQueryTrx['getBlockByHash']>[0] | GetBlockByHashParameters
    ) => ReturnType<PublicClientQueryTrx['getBlockByHash']>;
    readonly getBlockByNumber: (
        input: Parameters<PublicClientQueryTrx['getBlockByNumber']>[0] | GetBlockByNumberParameters
    ) => ReturnType<PublicClientQueryTrx['getBlockByNumber']>;
    readonly getBlockTransactionCount: (input?: GetBlockTransactionCountParameters) => ReturnType<PublicClientQueryTrx['getBlockTransactionCount']>;
    readonly getChainId: () => Promise<number>;
    readonly getLogs: (input: GetLogsParameters) => Promise<GetLogsReturnType>;
    readonly getBlockNumber: () => Promise<number>;
    readonly getTransaction: (
        input: Parameters<PublicClientQueryTrx['getTransaction']>[0] | GetTransactionParameters
    ) => ReturnType<PublicClientQueryTrx['getTransaction']>;
    readonly getTransactionInfo: (
        input: Parameters<PublicClientQueryTrx['getTransactionInfo']>[0] | GetTransactionParameters
    ) => ReturnType<PublicClientQueryTrx['getTransactionInfo']>;
    readonly getTransactionReceipt: (input: GetTransactionReceiptParameters) => Promise<TransactionInfo>;
    readonly waitForTransactionReceipt: (input: WaitForTransactionReceiptParameters) => Promise<TransactionInfo>;
    readonly readContract: <
        Abi extends ContractAbiInterface,
        FunctionName extends ReadContractFunctionName<Abi>,
    >(
        input: ReadContractParameters<Abi, FunctionName>
    ) => Promise<ReadContractReturnType<Abi, FunctionName>>;
    readonly verifyMessage: (input: VerifyMessageParameters) => Promise<boolean>;
    readonly verifyTypedData: (input: VerifyTypedDataParameters) => Promise<boolean>;
}

/** Configuration for createPublicClient (same shape as TronWebOptions, but no privateKey) */
export type PublicClientConfig = Omit<TronWebOptions, 'privateKey'> & {
    chain?: Chain;
    transport?: Transport;
    key?: string;
    name?: string;
};

/** Configuration for createWalletClient — like PublicClientConfig + an Account for signing */
export interface WalletClientConfig<TAccount extends WalletAccount = WalletAccount> extends PublicClientConfig {
    account: TAccount;
}

/** A read-only client that proxies TronWeb's trx and transactionBuilder */
export interface PublicClient extends ClientMetadata, PublicClientActions {
    /** Selected chain metadata, if configured */
    readonly chain?: Chain;
    /** Selected transport, if configured */
    readonly transport?: Transport;
    /** Filtered read-only access to tronWeb.trx */
    readonly trx: PublicClientTrx;
    /** Direct access to tronWeb.transactionBuilder (unsigned tx building) */
    readonly transactionBuilder: TransactionBuilder;
    /** @internal The underlying TronWeb instance; used by createContract */
    readonly _tronWeb: TronWeb;
}

/**
 * Parameters for WalletClient.sendTransaction.
 * K must be a method name of TransactionBuilder that returns a Promise.
 */
export type SendTransactionParams<K extends keyof TransactionBuilder> = {
    type: K;
    parameters: TransactionBuilder[K] extends (...args: infer P) => Promise<any> ? P : never;
};

/** A write-capable client that extends PublicClient with signing + broadcasting */
export interface WalletClient<TAccount extends WalletAccount = WalletAccount> extends PublicClient {
    /** Full access to tronWeb.trx, including write helpers */
    readonly trx: Trx;
    /** The Account used for signing */
    readonly account: TAccount;
    /**
     * Build, sign, and broadcast a transaction in a single call.
     *
     * @param params.type   - A method name on transactionBuilder (e.g. 'sendTrx', 'freezeBalanceV2')
     * @param params.parameters - Arguments forwarded to the transactionBuilder method
     *
     * @example
     * ```ts
     * await walletClient.sendTransaction({
     *   type: 'sendTrx',
     *   parameters: ['TXx...toAddress', 1_000_000, 'TXx...fromAddress'],
     * });
     * ```
     */
    sendTransaction<K extends keyof TransactionBuilder>(
        params: SendTransactionParams<K>
    ): Promise<BroadcastReturn<SignedTransaction>>;
}
