import type { TronWeb } from '../tronweb.js';
import type { TransactionBuilder } from '../lib/TransactionBuilder/TransactionBuilder.js';
import type { Trx } from '../lib/trx.js';
import type { WalletAccount } from '../accounts/types.js';
import type { Chain } from '../chains/index.js';
import type { Transport } from '../transports/index.js';
import type { SignedTransaction } from '../types/Transaction.js';
import type { TronWebOptions } from '../types/TronWeb.js';
import type { BroadcastReturn } from '../types/Trx.js';

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

export interface GetTransactionParameters {
    readonly hash?: string;
    readonly txId?: string;
}

export interface PublicClientActions {
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
    readonly getBlockNumber: () => Promise<number>;
    readonly getTransaction: (
        input: Parameters<PublicClientQueryTrx['getTransaction']>[0] | GetTransactionParameters
    ) => ReturnType<PublicClientQueryTrx['getTransaction']>;
    readonly getTransactionInfo: (
        input: Parameters<PublicClientQueryTrx['getTransactionInfo']>[0] | GetTransactionParameters
    ) => ReturnType<PublicClientQueryTrx['getTransactionInfo']>;
}

/** Configuration for createPublicClient (same shape as TronWebOptions, but no privateKey) */
export type PublicClientConfig = Omit<TronWebOptions, 'privateKey'> & {
    chain?: Chain;
    transport?: Transport;
};

/** Configuration for createWalletClient — like PublicClientConfig + an Account for signing */
export interface WalletClientConfig<TAccount extends WalletAccount = WalletAccount> extends PublicClientConfig {
    account: TAccount;
}

/** A read-only client that proxies TronWeb's trx and transactionBuilder */
export interface PublicClient extends PublicClientActions {
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
