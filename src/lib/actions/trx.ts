import type { HttpProvider } from '../providers/index.js';
import { isArray, isHex, isInteger, isObject } from '../../utils/validations.js';
import { isAddress, toHex } from '../../utils/address.js';
import type { Block, BlockHeaderRef, BlockWithoutDetail, GetTransactionResponse } from '../../types/APIResponse.js';
import type { Account, Address, BroadcastHexReturn, BroadcastReturn, TransactionInfo } from '../../types/Trx.js';
import type { SignedTransaction, Transaction } from '../../types/Transaction.js';

export async function getCurrentRefBlockParams(fullNode: HttpProvider): Promise<BlockHeaderRef> {
    try {
        const { block_header, blockID } = await fullNode.request<BlockWithoutDetail>(
            'wallet/getblock',
            { detail: false },
            'post'
        );
        const { number, timestamp } = block_header.raw_data;
        return {
            ref_block_bytes: number.toString(16).slice(-4).padStart(4, '0'),
            ref_block_hash: blockID.slice(16, 32),
            expiration: timestamp + 60 * 1000,
            timestamp,
        };
    } catch (e) {
        throw new Error(`Unable to get params: ${(e as Error).message || e}`);
    }
}

export async function sendRawTransaction<T extends SignedTransaction>(
    fullNode: HttpProvider,
    signedTransaction: T
): Promise<BroadcastReturn<T>> {
    if (!isObject(signedTransaction)) {
        throw new Error('Invalid transaction provided');
    }

    if (!signedTransaction.signature || !isArray(signedTransaction.signature)) {
        throw new Error('Transaction is not signed');
    }

    const result = await fullNode.request<Omit<BroadcastReturn<T>, 'transaction'>>(
        'wallet/broadcasttransaction',
        signedTransaction,
        'post'
    );
    return {
        ...result,
        transaction: signedTransaction,
    };
}

export function getCurrentBlock(fullNode: HttpProvider): Promise<Block> {
    return fullNode.request('wallet/getnowblock');
}

export async function getBlockByHash(fullNode: HttpProvider, blockHash: string): Promise<Block> {
    const block = await fullNode.request<Block>('wallet/getblockbyid', { value: blockHash }, 'post');
    if (!Object.keys(block).length) {
        throw new Error('Block not found');
    }
    return block;
}

export async function getBlockByNumber(fullNode: HttpProvider, blockID: number): Promise<Block> {
    if (!isInteger(blockID) || blockID < 0) {
        throw new Error('Invalid block number provided');
    }

    const block = await fullNode.request<Block>('wallet/getblockbynum', { num: parseInt(blockID as unknown as string) }, 'post');
    if (!Object.keys(block).length) {
        throw new Error('Block not found');
    }
    return block;
}

export async function getBlock(
    fullNode: HttpProvider,
    block: 'earliest' | 'latest' | number | string | false
): Promise<Block> {
    if (block === false) {
        throw new Error('No block identifier provided');
    }

    if (block === 'earliest') block = 0;

    if (block === 'latest') return getCurrentBlock(fullNode);

    if (isNaN(+block) && isHex(block.toString())) return getBlockByHash(fullNode, block as string);

    return getBlockByNumber(fullNode, block as number);
}

export async function getBlockTransactionCount(
    fullNode: HttpProvider,
    block: 'earliest' | 'latest' | number | string | false
): Promise<number> {
    const { transactions = [] } = await getBlock(fullNode, block);
    return transactions.length;
}

export async function getTransaction(fullNode: HttpProvider, transactionID: string): Promise<GetTransactionResponse> {
    const transaction = await fullNode.request<GetTransactionResponse>(
        'wallet/gettransactionbyid',
        { value: transactionID },
        'post'
    );
    if (!Object.keys(transaction).length) {
        throw new Error('Transaction not found');
    }
    return transaction;
}

export function getTransactionInfo(solidityNode: HttpProvider, transactionID: string): Promise<TransactionInfo> {
    return solidityNode.request('walletsolidity/gettransactioninfobyid', { value: transactionID }, 'post');
}

export async function getAccount(solidityNode: HttpProvider, address: string): Promise<Account> {
    if (!isAddress(address as Address)) {
        throw new Error('Invalid address provided');
    }

    return solidityNode.request('walletsolidity/getaccount', { address: toHex(address) }, 'post');
}

export async function getBalance(solidityNode: HttpProvider, address: string): Promise<number> {
    const { balance = 0 } = await getAccount(solidityNode, address);
    return balance;
}

export async function sendHexTransaction(fullNode: HttpProvider, signedHexTransaction: string) {
    if (!isHex(signedHexTransaction)) {
        throw new Error('Invalid hex transaction provided');
    }

    const params = { transaction: signedHexTransaction };

    const result = await fullNode.request<BroadcastHexReturn>('wallet/broadcasthex', params, 'post');
    if (result.result) {
        return {
            ...result,
            transaction: JSON.parse(result.transaction) as Transaction,
            hexTransaction: signedHexTransaction,
        };
    }
    return result;
}
