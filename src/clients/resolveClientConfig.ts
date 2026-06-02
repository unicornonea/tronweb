import { HttpProvider } from '../lib/providers/index.js';
import type { HeadersType } from '../types/Providers.js';
import type { TronWebOptions } from '../types/TronWeb.js';
import type { Chain } from '../chains/index.js';
import { http } from '../transports/http.js';
import type { HttpTransport, Transport } from '../transports/types.js';

const DEFAULT_FEE_LIMIT = 150_000_000;

type ResolvedHttpTransport = HttpTransport & { url: string };

type ClientConfigWithTransport = Omit<TronWebOptions, 'privateKey'> & {
    chain?: Chain;
    transport?: Transport;
    key?: string;
    name?: string;
};

export interface ResolvedClientConfig {
    chain?: Chain;
    transport?: Transport;
    tronWebConfig: Omit<TronWebOptions, 'privateKey'>;
}

export interface ResolvedClientProviders {
    chain?: Chain;
    transport?: Transport;
    fullNode: HttpProvider;
    solidityNode: HttpProvider;
    eventServer?: HttpProvider;
    feeLimit: number;
}

function hasExplicitNodeConfig(config: Omit<TronWebOptions, 'privateKey'>) {
    return Boolean(config.fullHost || config.fullNode || config.solidityNode || config.eventServer);
}

function resolveHttpTransport(chain?: Chain, transport?: Transport): ResolvedHttpTransport | undefined {
    if (!transport) {
        const url = chain?.rpcUrls.default.http[0];
        return url ? (http(url) as ResolvedHttpTransport) : undefined;
    }

    const url = transport.url ?? chain?.rpcUrls.default.http[0];
    if (!url) {
        throw new Error(
            'Could not resolve an HTTP endpoint. Provide transport: http(url), or pass a chain with a default HTTP RPC URL.'
        );
    }

    return {
        ...transport,
        url,
    } as ResolvedHttpTransport;
}

export function resolveClientConfig(config: ClientConfigWithTransport): ResolvedClientConfig {
    // Strip the client-only fields plus any `privateKey` smuggled in via `as any`.
    const {
        chain,
        transport,
        key: _key,
        name: _name,
        privateKey: _privateKey,
        ...tronWebConfig
    } = config as ClientConfigWithTransport & { privateKey?: unknown };

    if (hasExplicitNodeConfig(tronWebConfig)) {
        return { chain, transport, tronWebConfig };
    }

    const resolvedTransport = resolveHttpTransport(chain, transport);
    if (!resolvedTransport) {
        return { chain, transport, tronWebConfig };
    }

    const { headers = {}, timeout = 30000, url } = resolvedTransport;
    const eventHeaders = ((tronWebConfig.eventHeaders as HeadersType | undefined) ?? headers) as HeadersType;
    const { headers: _headers, eventHeaders: _eventHeaders, ...rest } = tronWebConfig;

    return {
        chain,
        transport: resolvedTransport,
        tronWebConfig: {
            ...rest,
            fullNode: new HttpProvider(url, timeout, '', '', headers),
            solidityNode: new HttpProvider(url, timeout, '', '', headers),
            eventServer: new HttpProvider(url, timeout, '', '', eventHeaders),
        },
    };
}

function toHttpProvider(value: HttpProvider | string | undefined, fallback?: string): HttpProvider | undefined {
    if (value === undefined) {
        return fallback ? new HttpProvider(fallback) : undefined;
    }
    return typeof value === 'string' ? new HttpProvider(value) : value;
}

/**
 * Resolve a client config into ready-to-use HTTP providers.
 *
 * Coerces string node URLs into HttpProvider instances and fills any
 * missing endpoint from `fullHost` when present. Throws if no node can
 * be derived from the input.
 */
export function resolveClientProviders(config: ClientConfigWithTransport): ResolvedClientProviders {
    const { chain, transport, tronWebConfig } = resolveClientConfig(config);
    const fullHost = (tronWebConfig as { fullHost?: string }).fullHost;
    const fullNode = toHttpProvider(tronWebConfig.fullNode, fullHost);
    const solidityNode = toHttpProvider(tronWebConfig.solidityNode, fullHost);
    const eventServer = toHttpProvider(tronWebConfig.eventServer, fullHost);

    if (!fullNode) {
        throw new Error('Client requires fullNode (or fullHost) to be configured.');
    }

    return {
        chain,
        transport,
        fullNode,
        solidityNode: solidityNode ?? fullNode,
        eventServer,
        feeLimit: DEFAULT_FEE_LIMIT,
    };
}
