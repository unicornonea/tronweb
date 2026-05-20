import { HttpProvider } from '../lib/providers/index.js';
import type { HeadersType } from '../types/Providers.js';
import type { TronWebOptions } from '../types/TronWeb.js';
import type { Chain } from '../chains/index.js';
import { http } from '../transports/http.js';
import type { HttpTransport, Transport } from '../transports/types.js';

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
    const { chain, transport, key: _key, name: _name, ...tronWebConfig } = config;

    if (hasExplicitNodeConfig(tronWebConfig)) {
        return {
            chain,
            transport,
            tronWebConfig,
        };
    }

    const resolvedTransport = resolveHttpTransport(chain, transport);
    if (!resolvedTransport) {
        return {
            chain,
            transport,
            tronWebConfig,
        };
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