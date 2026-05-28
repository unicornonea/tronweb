import { HttpProvider } from '../lib/providers/index.js';
import type { HeadersType } from '../types/Providers.js';
import type { TronWebOptions } from '../types/TronWeb.js';
import type { Chain } from '../chains/index.js';
import { http } from '../transports/http.js';
import type { HttpTransport, Transport } from '../transports/types.js';
import type { TronWeb } from '../tronweb.js';

const CLIENT_DISABLED_TRONWEB_MUTATORS = [
    'setPrivateKey',
    'setAddress',
    'setFullNode',
    'setSolidityNode',
    'setEventServer',
    'setDefaultBlock',
] as const;

export function disableClientTronWebMutators(tronWeb: TronWeb): TronWeb {
    for (const name of CLIENT_DISABLED_TRONWEB_MUTATORS) {
        Object.defineProperty(tronWeb, name, {
            value: () => {
                throw new Error(
                    `${name} is disabled on a client-managed TronWeb instance. ` +
                        'Client configuration is immutable after creation; build a new client with the desired settings instead.'
                );
            },
            writable: false,
            configurable: false,
        });
    }
    // Defence in depth: even if a privateKey leaked into the constructor before
    // setPrivateKey was locked, scrub defaultPrivateKey and freeze the slot so
    // trx.sign(...) (which defaults to this.tronWeb.defaultPrivateKey) cannot
    // backdoor-sign.
    Object.defineProperty(tronWeb, 'defaultPrivateKey', {
        value: '',
        writable: false,
        configurable: false,
    });
    // Lock the provider fields too. The locked setters above prevent
    // setFullNode / setSolidityNode / setEventServer from being called, but the
    // backing fields are plain writable properties and `event.setServer(...)`
    // mutates `this.tronWeb.eventServer` directly — freezing the slots closes
    // that path as well.
    for (const field of ['fullNode', 'solidityNode', 'eventServer'] as const) {
        Object.defineProperty(tronWeb, field, {
            value: tronWeb[field],
            writable: false,
            configurable: false,
        });
    }
    return tronWeb;
}

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
    // Strip the client-only fields plus any `privateKey` smuggled in via `as any`.
    // The Omit on ClientConfigWithTransport is type-only — runtime guard is required
    // so a stray privateKey never reaches the underlying TronWeb constructor.
    const {
        chain,
        transport,
        key: _key,
        name: _name,
        privateKey: _privateKey,
        ...tronWebConfig
    } = config as ClientConfigWithTransport & { privateKey?: unknown };

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