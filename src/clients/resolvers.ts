import { HttpProvider } from '../lib/providers/index.js';
import type { HeadersType } from '../types/Providers.js';
import type { NodeProvider, TronWebOptions } from '../types/TronWeb.js';
import type { Chain } from './chains.js';
import { http } from './transports/http.js';
import type { HttpTransport, Transport } from './transports/types.js';
import { ADDRESS_PREFIX } from '../utils/constants.js';
import { hexToBytes } from '../utils/bytes.js';
import { toHex } from '../utils/address.js';
import type {
    GetBlockParameters,
    GetBlockTransactionCountParameters,
    GetTransactionReceiptParameters,
    GetTransactionParameters,
    PublicClientActions,
    VerifyMessageParameters,
    WaitForTransactionReceiptParameters,
} from './types.js';
import type { Hex, SignableMessage, WalletAccount } from './accounts/types.js';

const DEFAULT_FEE_LIMIT = 150_000_000;
const NULL_CALLER_ADDRESS = `${ADDRESS_PREFIX}${'0'.repeat(40)}`;

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
    return Boolean(config.fullHost || config.fullNode);
}

function resolveHttpTransport(chain?: Chain, transport?: Transport): ResolvedHttpTransport {
    const url = transport?.url ?? chain?.rpcUrls.default.http[0];
    if (!url) {
        throw new Error(
            'Could not resolve an HTTP endpoint. Provide transport: http(url), or pass a chain with a default HTTP RPC URL.'
        );
    }

    if (!transport) {
        return http(url) as ResolvedHttpTransport;
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
    const { headers = {}, timeout = 30000, url } = resolvedTransport;

    return {
        chain,
        transport: resolvedTransport,
        tronWebConfig: {
            fullNode: new HttpProvider(url, timeout, '', '', headers),
            solidityNode: new HttpProvider(url, timeout, '', '', headers),
            eventServer: new HttpProvider(url, timeout, '', '', headers),
        },
    };
}

function toHttpProvider(value: HttpProvider | string | undefined, fallback?: NodeProvider, headers?: HeadersType): HttpProvider | undefined {
    if (value === undefined) {
        return fallback
            ? typeof fallback === 'string'
                ? new HttpProvider(fallback, undefined, '', '', headers)
                : fallback
            : undefined;
    }
    return typeof value === 'string' ? new HttpProvider(value, undefined, '', '', headers) : value;
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
    const { eventHeaders, fullHost, headers } = tronWebConfig;
    const fullNode = toHttpProvider(tronWebConfig.fullNode, fullHost, headers);
    const solidityNode = toHttpProvider(tronWebConfig.solidityNode, fullHost, headers);
    const eventServer = toHttpProvider(tronWebConfig.eventServer, fullHost, eventHeaders ?? headers);

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

export function resolveCallValue(value: number | bigint | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'bigint') {
        if (value < 0n) {
            throw new Error('call value cannot be negative');
        }
        // Number(bigint) silently loses precision above 2^53; reject rather than truncate.
        if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error('call value exceeds safe integer range');
        }
        return Number(value);
    }
    if (typeof value !== 'number') {
        throw new Error('call value must be a number or bigint');
    }
    if (value < 0) {
        throw new Error('call value cannot be negative');
    }
    if (BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('call value exceeds safe integer range');
    }
    return value;
}

export function resolveCallerAddress(account: string | undefined, defaultAddress?: string): string {
    if (typeof account === 'string' && account.length > 0) return account;
    if (typeof defaultAddress === 'string' && defaultAddress.length > 0) return defaultAddress;
    return NULL_CALLER_ADDRESS;
}

function normalizeRawMessage(raw: Hex | Uint8Array): Uint8Array {
    if (raw instanceof Uint8Array) return raw;
    if (!/^0x[0-9a-fA-F]+$/.test(raw)) {
        throw new Error('Invalid raw message: must be a 0x-prefixed hex string or Uint8Array');
    }
    // raw.length includes the even-length '0x' prefix, so its parity matches the hex digit count.
    if (raw.length % 2 !== 0) {
        throw new Error('Invalid raw message: hex string must have an even number of digits');
    }
    return hexToBytes(raw.slice(2));
}

function isRawMessageInput(
    message: VerifyMessageParameters['message']
): message is Extract<SignableMessage, { readonly raw: Hex | Uint8Array }> {
    return typeof message === 'object' && message !== null && !Array.isArray(message) && 'raw' in message;
}

export function resolveMessageInput(message: VerifyMessageParameters['message']): string | Uint8Array {
    if (typeof message === 'string') return message;
    if (isRawMessageInput(message)) return normalizeRawMessage(message.raw);
    throw new Error('Invalid message input');
}


export function resolveAddressInput(
    input: Parameters<PublicClientActions['getAccount']>[0] | Parameters<PublicClientActions['getBalance']>[0],
    methodName: 'getAccount' | 'getBalance',
    defaultAddress?: string
): string {
    // No explicit address → fall back to the configured (wallet) address, matching legacy
    // trx.getAccount/getBalance(address = tronWeb.defaultAddress.hex).
    if (input === undefined && typeof defaultAddress === 'string' && defaultAddress.length > 0) {
        return defaultAddress;
    }
    if (input === undefined || input === false || typeof input === 'string') return input as string;
    if (!('address' in input) || typeof input.address !== 'string') {
        throw new Error(`${methodName} requires either an address string or { address }.`);
    }
    return input.address;
}

export function resolveBlockInput(
    input: Parameters<PublicClientActions['getBlock']>[0]
): 'earliest' | 'latest' | number | string | false {
    if (input === undefined) return 'latest';
    if (input === false || typeof input === 'string' || typeof input === 'number') return input;

    const parameters = input as GetBlockParameters;
    const entries = [
        ['blockHash', parameters.blockHash],
        ['blockNumber', parameters.blockNumber],
        ['blockTag', parameters.blockTag],
    ].filter(([, value]) => value !== undefined);

    if (entries.length !== 1) {
        throw new Error('getBlock requires exactly one of blockHash, blockNumber, or blockTag when using object-style input.');
    }

    return entries[0][1] as 'earliest' | 'latest' | number | string;
}

export function resolveBlockTransactionCountInput(
    input: GetBlockTransactionCountParameters | undefined
): 'earliest' | 'latest' | number | string | false {
    if (!input) return 'latest';

    const entries = [
        ['blockHash', input.blockHash],
        ['blockNumber', input.blockNumber],
        ['blockTag', input.blockTag],
    ].filter(([, value]) => value !== undefined);

    if (entries.length === 0) return 'latest';

    if (entries.length !== 1) {
        throw new Error('getBlockTransactionCount requires at most one of blockHash, blockNumber, or blockTag.');
    }

    return entries[0][1] as 'earliest' | 'latest' | number | string;
}

export function resolveBlockHashInput(input: Parameters<PublicClientActions['getBlockByHash']>[0]): string {
    if (typeof input === 'string') return input;
    if (!('blockHash' in input) || typeof input.blockHash !== 'string') {
        throw new Error('getBlockByHash requires either a block hash string or { blockHash }.');
    }
    return input.blockHash;
}

export function resolveBlockNumberInput(input: Parameters<PublicClientActions['getBlockByNumber']>[0]): number {
    if (typeof input === 'number') return input;
    if (!('blockNumber' in input) || typeof input.blockNumber !== 'number') {
        throw new Error('getBlockByNumber requires either a block number or { blockNumber }.');
    }
    return input.blockNumber;
}

export function resolveTransactionInput(
    input:
        | Parameters<PublicClientActions['getTransaction']>[0]
        | Parameters<PublicClientActions['getTransactionInfo']>[0]
        | Parameters<PublicClientActions['getTransactionReceipt']>[0]
        | WaitForTransactionReceiptParameters,
    methodName: 'getTransaction' | 'getTransactionInfo' | 'getTransactionReceipt' | 'waitForTransactionReceipt'
): string {
    if (typeof input === 'string') return input;

    const parameters = input as GetTransactionParameters;
    const transactionId = parameters.txId ?? parameters.hash;

    if (typeof transactionId !== 'string') {
        throw new Error(`${methodName} requires either a transaction id string or { txId } / { hash }.`);
    }

    if (parameters.txId && parameters.hash && parameters.txId !== parameters.hash) {
        throw new Error(`${methodName} received conflicting txId and hash values.`);
    }

    return transactionId;
}

export function resolveTransactionHashInput(
    input: GetTransactionReceiptParameters | WaitForTransactionReceiptParameters,
    methodName: 'getTransactionReceipt' | 'waitForTransactionReceipt'
): string {
    if (!input || typeof input.hash !== 'string') {
        throw new Error(`${methodName} requires { hash }.`);
    }

    return input.hash;
}

export function resolveSignerAddress(account: WalletAccount, accountOverride: string | undefined): string {
    if (accountOverride === undefined) return account.address;
    if (toHex(accountOverride).toLowerCase() !== toHex(account.address).toLowerCase()) {
        throw new Error('Wallet client account override must match the configured account.');
    }
    return accountOverride;
}