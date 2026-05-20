import { TronWeb } from '../tronweb.js';
import type { Trx } from '../lib/trx.js';
import {
    PUBLIC_CLIENT_BLOCKED_TRX_METHODS,
    type PublicClient,
    type PublicClientConfig,
    type PublicClientTrx,
} from './types.js';
import { createClientMetadata } from './createClientMetadata.js';
import { createClientQueryActions } from './createClientQueryActions.js';
import { resolveClientConfig } from './resolveClientConfig.js';

const publicClientBlockedTrxMethods = new Set<PropertyKey>(PUBLIC_CLIENT_BLOCKED_TRX_METHODS);

function createPublicClientTrx(trx: Trx): PublicClientTrx {
    const publicTrx: Record<PropertyKey, unknown> = {};
    let prototype = Object.getPrototypeOf(trx);

    while (prototype && prototype !== Object.prototype) {
        for (const key of Reflect.ownKeys(prototype)) {
            if (key === 'constructor' || publicClientBlockedTrxMethods.has(key) || key in publicTrx) continue;

            const descriptor = Reflect.getOwnPropertyDescriptor(prototype, key);
            if (!descriptor) continue;

            const value = Reflect.get(trx, key);

            if ('value' in descriptor && typeof value === 'function') {
                Object.defineProperty(publicTrx, key, {
                    configurable: false,
                    enumerable: true,
                    value: value.bind(trx),
                    writable: false,
                });
                continue;
            }

            Object.defineProperty(publicTrx, key, {
                configurable: false,
                enumerable: true,
                get: () => Reflect.get(trx, key),
            });
        }

        prototype = Object.getPrototypeOf(prototype);
    }

    return Object.freeze(publicTrx) as PublicClientTrx;
}

/**
 * Create a read-only TronWeb client.
 *
 * The returned client proxies `trx` and `transactionBuilder` from an internal
 * TronWeb instance. No private key is involved — all state-changing operations
 * require a WalletClient.
 *
 * @example
 * ```ts
 * const publicClient = createPublicClient({
 *   chain: nile,
 *   transport: http(),
 * });
 * const block = await publicClient.trx.getCurrentBlock();
 * ```
 */
export function createPublicClient(config: PublicClientConfig): PublicClient {
    const { key, name } = config;
    const { chain, transport, tronWebConfig } = resolveClientConfig(config);
    const tronWeb = new TronWeb({ ...tronWebConfig });
    const publicTrx = createPublicClientTrx(tronWeb.trx);
    const metadata = createClientMetadata({
        key,
        name,
        defaultKey: 'public',
        defaultName: 'Public Client',
        type: 'publicClient',
    });
    const queryActions = createClientQueryActions({ chain, tronWeb, trx: tronWeb.trx });

    const client: PublicClient = {
        ...metadata,
        ...queryActions,
        get chain() {
            return chain;
        },
        get transport() {
            return transport;
        },
        get trx() {
            return publicTrx;
        },
        get transactionBuilder() {
            return tronWeb.transactionBuilder;
        },
        get _tronWeb() {
            return tronWeb;
        },
    };

    return client;
}
