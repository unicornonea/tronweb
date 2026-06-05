export interface Chain {
    readonly id: number;
    readonly name: string;
    readonly network: 'mainnet' | 'testnet';
    readonly nativeCurrency: {
        readonly name: 'TRON';
        readonly symbol: 'TRX';
        readonly decimals: 6;
    };
    readonly rpcUrls: {
        readonly default: {
            readonly http: readonly [string, ...string[]];
        };
    };
}

export function defineChain<const chain extends Chain>(chain: chain): chain {
    return chain;
}

const nativeCurrency = {
    name: 'TRON',
    symbol: 'TRX',
    decimals: 6,
} as const;

export const mainnet = defineChain({
    id: 728_126_428,
    name: 'TRON Mainnet',
    network: 'mainnet',
    nativeCurrency,
    rpcUrls: {
        default: {
            http: ['https://api.trongrid.io'],
        },
    },
} as const);

export const nile = defineChain({
    id: 3_448_148_188,
    name: 'TRON Nile Testnet',
    network: 'testnet',
    nativeCurrency,
    rpcUrls: {
        default: {
            http: ['https://nile.trongrid.io'],
        },
    },
} as const);

export const shasta = defineChain({
    id: 2_494_104_990,
    name: 'TRON Shasta Testnet',
    network: 'testnet',
    nativeCurrency,
    rpcUrls: {
        default: {
            http: ['https://api.shasta.trongrid.io'],
        },
    },
} as const);