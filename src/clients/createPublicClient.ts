import { HttpProvider } from '../lib/providers/index.js';
import type { PublicClient, PublicClientConfig } from './types.js';
import { createClientMetadata } from './createClientMetadata.js';
import { createClientQueryActions } from './createClientQueryActions.js';
import { resolveClientProviders } from './resolvers.js';

/**
 * Create a read-only client.
 *
 * The client wraps HTTP providers directly — no internal TronWeb instance is
 * created. All state-changing operations require a WalletClient.
 *
 * @example
 * ```ts
 * const publicClient = createPublicClient({
 *   chain: nile,
 *   transport: http(),
 * });
 * const block = await publicClient.getBlock({ blockTag: 'latest' });
 * ```
 */
export function createPublicClient(config: PublicClientConfig): PublicClient {
    const { key, name } = config;
    const { chain, transport, fullNode, solidityNode, eventServer, feeLimit } = resolveClientProviders(config);

    const metadata = createClientMetadata({
        key,
        name,
        defaultKey: 'public',
        defaultName: 'Public Client',
        type: 'publicClient',
    });
    const queryActions = createClientQueryActions({
        chain,
        fullNode,
        solidityNode,
        eventServer,
        feeLimit,
    });

    const client: PublicClient = {
        ...metadata,
        ...queryActions,
        get chain() {
            return chain;
        },
        get transport() {
            return transport;
        },
    };

    return client;
}

// Re-export for backwards-compat with anyone importing the provider type directly.
export type { HttpProvider };
