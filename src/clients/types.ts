import type * as tbActions from '../lib/actions/transactionBuilder.js';
import type { Account, BroadcastReturn, TransactionInfo } from '../types/Trx.js';
import type { Block, GetTransactionResponse } from '../types/APIResponse.js';
import type { Hex, SignTypedDataParameters, SignableMessage, WalletAccount } from './accounts/types.js';
import type { Chain } from './chains.js';
import type { Transport } from './transports/index.js';
import type { ContractAbiInterface, EventFragment, FunctionFragment, GetOutputsType, GetParamsType } from '../types/ABI.js';
import type { EventResponse, GetEventResultOptions } from '../types/Event.js';
import type { SignedTransaction, Transaction } from '../types/Transaction.js';
import type { TronWebOptions } from '../types/TronWeb.js';
import type { ClientType } from './createClientMetadata.js';

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

export type ReadContractFunctionName<Abi extends ContractAbiInterface> = Abi[number] extends infer Fragment
    ? Fragment extends FunctionFragment
        ? IsReadOnlyFunction<Fragment> extends true
            ? Fragment['name']
            : never
        : never
    : never;

export type EstimateContractGasFunctionName<Abi extends ContractAbiInterface> = Abi[number] extends infer Fragment
    ? Fragment extends FunctionFragment
        ? IsWriteFunction<Fragment> extends true
            ? Fragment['name']
            : never
        : never
    : never;

export type WriteContractFunctionName<Abi extends ContractAbiInterface> = EstimateContractGasFunctionName<Abi>;

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

type WriteContractFragment<
    Abi extends ContractAbiInterface,
    FunctionName extends WriteContractFunctionName<Abi>,
> = Extract<Abi[number], { type: 'function'; name: FunctionName }> extends infer Fragment
    ? Fragment extends FunctionFragment
        ? Fragment
        : never
    : never;

type WriteContractInputs<
    Abi extends ContractAbiInterface,
    FunctionName extends WriteContractFunctionName<Abi>,
> = WriteContractFragment<Abi, FunctionName> extends FunctionFragment
    ? WriteContractFragment<Abi, FunctionName>['inputs']
    : undefined;

type CollapseSingleItemTuple<Value> = Value extends readonly [infer Only] ? Only : Value;

type IsNever<T> = [T] extends [never] ? true : false;

type ChangeNeverToAnyArray<T> = IsNever<T> extends true ? any[] : T;

type ChangeNeverToAny<T> = IsNever<T> extends true ? any : T;

type ChangeNeverToString<T> = IsNever<T> extends true ? string : T;

export type ReadContractParameters<
    Abi extends ContractAbiInterface = ContractAbiInterface,
    FunctionName extends ReadContractFunctionName<Abi> = ReadContractFunctionName<Abi>,
> = {
    readonly address: string;
    readonly abi: Abi;
    readonly functionName: ChangeNeverToString<FunctionName>;
    readonly args?: ChangeNeverToAnyArray<GetParamsType<ReadContractInputs<Abi, FunctionName>>>;
    readonly account?: string;
    readonly value?: number | bigint;
};

export type ReadContractReturnType<
    Abi extends ContractAbiInterface = ContractAbiInterface,
    FunctionName extends ReadContractFunctionName<Abi> = ReadContractFunctionName<Abi>,
> = ChangeNeverToAny<CollapseSingleItemTuple<GetOutputsType<ReadContractOutputs<Abi, FunctionName>>>>;

export type EstimateContractGasParameters<
    Abi extends ContractAbiInterface = ContractAbiInterface,
    FunctionName extends EstimateContractGasFunctionName<Abi> = EstimateContractGasFunctionName<Abi>,
> = {
    readonly address: string;
    readonly abi: Abi;
    readonly functionName: ChangeNeverToString<FunctionName>;
    readonly args?: ChangeNeverToAnyArray<GetParamsType<ReadContractInputs<Abi, FunctionName>>>;
    readonly account?: string;
    readonly value?: number | bigint;
};

export type EstimateContractGasReturnType = bigint;

export interface GetAddressesReturnType extends ReadonlyArray<string> {}

export interface RequestAddressesReturnType extends ReadonlyArray<string> {}

export interface SendRawTransactionParameters<TTransaction extends SignedTransaction = SignedTransaction> {
    readonly transaction: TTransaction;
}

export type SendRawTransactionReturnType<TTransaction extends SignedTransaction = SignedTransaction> = BroadcastReturn<TTransaction>;

export interface SignTransactionParameters<TTransaction extends Transaction = Transaction> {
    readonly transaction: TTransaction;
}

export type SignTransactionReturnType = SignedTransaction;

export type WriteContractParameters<
    Abi extends ContractAbiInterface = ContractAbiInterface,
    FunctionName extends WriteContractFunctionName<Abi> = WriteContractFunctionName<Abi>,
> = {
    readonly address: string;
    readonly abi: Abi;
    readonly functionName: ChangeNeverToString<FunctionName>;
    readonly args?: ChangeNeverToAnyArray<GetParamsType<WriteContractInputs<Abi, FunctionName>>>;
    readonly account?: string;
    readonly value?: number | bigint;
    readonly feeLimit?: number;
    readonly tokenId?: string;
    readonly tokenValue?: number;
    readonly permissionId?: number;
};

export type WriteContractReturnType = string;

export type DeployContractParameters<Abi extends ContractAbiInterface = ContractAbiInterface> = {
    readonly abi: Abi;
    readonly bytecode: string;
    readonly args?: readonly unknown[];
    readonly account?: string;
    readonly name?: string;
    readonly value?: number | bigint;
    readonly feeLimit?: number;
    readonly tokenId?: string;
    readonly tokenValue?: number;
    readonly userFeePercentage?: number;
    readonly originEnergyLimit?: number;
    readonly permissionId?: number;
    readonly blockHeader?: Partial<Transaction['raw_data']>;
    readonly rawParameter?: string;
};

export type DeployContractReturnType = string;

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
    readonly getAccount: (input?: string | false | GetAccountParameters) => Promise<Account>;
    readonly getBalance: (input?: string | false | GetBalanceParameters) => Promise<number>;
    readonly getBlock: (
        input?: 'earliest' | 'latest' | number | string | false | GetBlockParameters
    ) => Promise<Block>;
    readonly getBlockByHash: (input: string | GetBlockByHashParameters) => Promise<Block>;
    readonly getBlockByNumber: (input: number | GetBlockByNumberParameters) => Promise<Block>;
    readonly getBlockTransactionCount: (input?: GetBlockTransactionCountParameters) => Promise<number>;
    readonly getChainId: () => Promise<number>;
    readonly getLogs: (input: GetLogsParameters) => Promise<GetLogsReturnType>;
    readonly getBlockNumber: () => Promise<number>;
    readonly getTransaction: (input: string | GetTransactionParameters) => Promise<GetTransactionResponse>;
    readonly getTransactionInfo: (input: string | GetTransactionParameters) => Promise<TransactionInfo>;
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
    /**
     * Build a transaction-builder action's transaction (without signing or
     * broadcasting). `type` selects an action; `parameters` are its positional
     * args after the implicit provider prefix the client injects automatically.
     * Resolves to the selected action's own return type.
     */
    readonly createTransaction: <K extends CreateTransactionType>(
        params: CreateTransactionParams<K>
    ) => CreateTransactionReturn<K>;
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

/** A read-only client. */
export interface PublicClient extends ClientMetadata, PublicClientActions {
    /** Selected chain metadata, if configured */
    readonly chain?: Chain;
    /** Selected transport, if configured */
    readonly transport?: Transport;
}

/**
 * Names of transaction-builder actions dispatchable via WalletClient.sendTransaction.
 *
 * Each entry corresponds to an exported function in `lib/actions/transactionBuilder`
 * that produces a signable transaction.
 */
export type CreateTransactionType =
    | 'sendTrx'
    | 'sendToken'
    | 'purchaseToken'
    | 'freezeBalance'
    | 'unfreezeBalance'
    | 'freezeBalanceV2'
    | 'unfreezeBalanceV2'
    | 'cancelUnfreezeBalanceV2'
    | 'delegateResource'
    | 'undelegateResource'
    | 'withdrawExpireUnfreeze'
    | 'withdrawBlockRewards'
    | 'applyForSR'
    | 'vote'
    | 'updateBrokerage'
    | 'createSmartContract'
    | 'triggerSmartContract'
    | 'triggerConstantContract'
    | 'triggerConfirmedConstantContract'
    | 'estimateEnergy'
    | 'deployConstantContract'
    | 'clearABI'
    | 'createToken'
    | 'updateToken'
    | 'createAccount'
    | 'updateAccount'
    | 'setAccountId'
    | 'createProposal'
    | 'deleteProposal'
    | 'voteProposal'
    | 'createTRXExchange'
    | 'createTokenExchange'
    | 'injectExchangeTokens'
    | 'withdrawExchangeTokens'
    | 'tradeExchangeTokens'
    | 'updateSetting'
    | 'updateEnergyLimit'
    | 'updateAccountPermissions'
    | 'newTxID'
    | 'alterTransaction'
    | 'extendExpiration'
    | 'addUpdateData';

/**
 * Parameters for WalletClient.sendTransaction.
 * `type` selects an action; `parameters` are the action's positional args
 * AFTER the implicit provider prefix (fullNode, and where applicable solidityNode / cache)
 * that the wallet client injects automatically.
 */
export type CreateTransactionParams<K extends CreateTransactionType = CreateTransactionType> = {
    type: K;
    parameters: (typeof tbActions)[K] extends (first: any, ...rest: infer R) => Promise<any>
        ? K extends 'triggerSmartContract' | 'triggerConstantContract' | 'triggerConfirmedConstantContract' | 'estimateEnergy' | 'deployConstantContract'
            ? R extends [any, ...infer Rest] ? Rest : never
            : K extends 'clearABI'
              ? R extends [any, ...infer Rest] ? Rest : never
              : R
        : never;
};

/**
 * Transaction-builder actions that perform a constant/read-only query — constant
 * contract triggers, energy estimation, and constant deploy. They never produce a
 * broadcastable transaction, so sendTransaction returns the node's result as-is
 * instead of signing and broadcasting.
 */
export type SendTransactionConstantType =
    | 'triggerConstantContract'
    | 'triggerConfirmedConstantContract'
    | 'estimateEnergy'
    | 'deployConstantContract';

/**
 * Resolved return type of WalletClient.sendTransaction for a given action `type`.
 * Constant/read-only actions resolve to the action's own result; every other action
 * is signed and broadcast, resolving to the broadcast result.
 */
export type SendTransactionReturn<K extends CreateTransactionType = CreateTransactionType> = K extends SendTransactionConstantType
    ? Awaited<ReturnType<(typeof tbActions)[K]>>
    : BroadcastReturn<SignedTransaction>;

/**
 * Resolved return type of PublicClientActions.createTransaction for a given
 * action `type` — the transaction-builder action's own return type (a Promise),
 * before any signing or broadcasting.
 */
export type CreateTransactionReturn<K extends CreateTransactionType = CreateTransactionType> = ReturnType<(typeof tbActions)[K]>;

/** A write-capable client. */
export interface WalletClient<TAccount extends WalletAccount = WalletAccount> extends PublicClient {
    /** The Account used for signing */
    readonly account: TAccount;
    readonly getAddresses: () => Promise<GetAddressesReturnType>;
    readonly requestAddresses: () => Promise<RequestAddressesReturnType>;
    readonly sendRawTransaction: <TTransaction extends SignedTransaction = SignedTransaction>(
        params: SendRawTransactionParameters<TTransaction>
    ) => Promise<SendRawTransactionReturnType<TTransaction>>;
    readonly signMessage: (input: { readonly message: SignableMessage }) => Promise<Hex>;
    readonly signTransaction: <TTransaction extends Transaction = Transaction>(
        params: SignTransactionParameters<TTransaction>
    ) => Promise<SignTransactionReturnType>;
    readonly signTypedData: (input: SignTypedDataParameters) => Promise<Hex>;
    readonly writeContract: <
        Abi extends ContractAbiInterface,
        FunctionName extends WriteContractFunctionName<Abi>,
    >(
        input: WriteContractParameters<Abi, FunctionName>
    ) => Promise<WriteContractReturnType>;
    readonly deployContract: <Abi extends ContractAbiInterface>(
        input: DeployContractParameters<Abi>
    ) => Promise<DeployContractReturnType>;
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
    sendTransaction<K extends CreateTransactionType>(
        params: CreateTransactionParams<K>
    ): Promise<SendTransactionReturn<K>>;
}
