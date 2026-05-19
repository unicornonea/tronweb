import type {
    GetBlockParameters,
    GetTransactionParameters,
    PublicClientActions,
    PublicClientQueryTrx,
} from './types.js';

function resolveAddressInput(
    input: Parameters<PublicClientActions['getAccount']>[0] | Parameters<PublicClientActions['getBalance']>[0],
    methodName: 'getAccount' | 'getBalance'
): Parameters<PublicClientQueryTrx['getAccount']>[0] | Parameters<PublicClientQueryTrx['getBalance']>[0] {
    if (input === undefined || input === false || typeof input === 'string') return input;
    if (!('address' in input) || typeof input.address !== 'string') {
        throw new Error(`${methodName} requires either an address string or { address }.`);
    }
    return input.address;
}

function resolveBlockInput(
    input: Parameters<PublicClientActions['getBlock']>[0]
): Parameters<PublicClientQueryTrx['getBlock']>[0] {
    if (input === undefined || input === false || typeof input === 'string' || typeof input === 'number') return input;

    const parameters = input as GetBlockParameters;
    const entries = [
        ['blockHash', parameters.blockHash],
        ['blockNumber', parameters.blockNumber],
        ['blockTag', parameters.blockTag],
    ].filter(([, value]) => value !== undefined);

    if (entries.length !== 1) {
        throw new Error('getBlock requires exactly one of blockHash, blockNumber, or blockTag when using object-style input.');
    }

    return entries[0][1] as Parameters<PublicClientQueryTrx['getBlock']>[0];
}

function resolveBlockHashInput(
    input: Parameters<PublicClientActions['getBlockByHash']>[0]
): Parameters<PublicClientQueryTrx['getBlockByHash']>[0] {
    if (typeof input === 'string') return input;
    if (!('blockHash' in input) || typeof input.blockHash !== 'string') {
        throw new Error('getBlockByHash requires either a block hash string or { blockHash }.');
    }
    return input.blockHash;
}

function resolveBlockNumberInput(
    input: Parameters<PublicClientActions['getBlockByNumber']>[0]
): Parameters<PublicClientQueryTrx['getBlockByNumber']>[0] {
    if (typeof input === 'number') return input;
    if (!('blockNumber' in input) || typeof input.blockNumber !== 'number') {
        throw new Error('getBlockByNumber requires either a block number or { blockNumber }.');
    }
    return input.blockNumber;
}

function resolveTransactionInput(
    input: Parameters<PublicClientActions['getTransaction']>[0] | Parameters<PublicClientActions['getTransactionInfo']>[0],
    methodName: 'getTransaction' | 'getTransactionInfo'
): Parameters<PublicClientQueryTrx['getTransaction']>[0] | Parameters<PublicClientQueryTrx['getTransactionInfo']>[0] {
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

export function createClientQueryActions(trx: PublicClientQueryTrx): PublicClientActions {
    return {
        getAccount: (input) => trx.getAccount(resolveAddressInput(input, 'getAccount')),
        getBalance: (input) => trx.getBalance(resolveAddressInput(input, 'getBalance')),
        getBlock: (input) => trx.getBlock(resolveBlockInput(input)),
        getBlockByHash: (input) => trx.getBlockByHash(resolveBlockHashInput(input)),
        getBlockByNumber: (input) => trx.getBlockByNumber(resolveBlockNumberInput(input)),
        getBlockNumber: async () => {
            const block = await trx.getCurrentBlock();
            return block.block_header.raw_data.number;
        },
        getTransaction: (input) => trx.getTransaction(resolveTransactionInput(input, 'getTransaction')),
        getTransactionInfo: (input) => trx.getTransactionInfo(resolveTransactionInput(input, 'getTransactionInfo')),
    };
}