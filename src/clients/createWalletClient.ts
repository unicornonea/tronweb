import { TronWeb } from '../tronweb.js';
import type { WalletClient, WalletClientConfig, SendTransactionParams } from './types.js';
import type { WalletAccount } from '../accounts/types.js';
import type { TransactionBuilder } from '../lib/TransactionBuilder/TransactionBuilder.js';
import type { SignedTransaction } from '../types/Transaction.js';
import type { BroadcastReturn } from '../types/Trx.js';
import { createClientQueryActions } from './createClientQueryActions.js';
import { resolveClientConfig } from './resolveClientConfig.js';

/**
 * Create a write-capable TronWeb client, analogous to viem's `createWalletClient`.
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
    const { account, ...clientConfig } = config;
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

    const queryActions = createClientQueryActions(tronWeb.trx);

    const client: WalletClient<TAccount> = {
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
        sendTransaction,
    };

    return client;
}
