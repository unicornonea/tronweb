import { assert } from 'chai';

import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js';
import { createPublicClient } from '../../../src/clients/createPublicClient.js';
import { createWalletClient } from '../../../src/clients/createWalletClient.js';
import { mainnet, nile, shasta } from '../../../src/chains/index.js';
import {
    createPublicClient as createPublicClientFromRoot,
    createWalletClient as createWalletClientFromRoot,
    defineChain,
    http,
} from '../../../src/index.js';

describe('client factories', function () {
    const fullHost = 'http://127.0.0.1';

    it('exports client factories from the package root', function () {
        assert.strictEqual(createPublicClientFromRoot, createPublicClient);
        assert.strictEqual(createWalletClientFromRoot, createWalletClient);
        assert.isFunction(defineChain);
        assert.isFunction(http);
    });

    it('createPublicClient resolves chain defaults through http transport', function () {
        const cases = [
            [mainnet, 728_126_428, 'https://api.trongrid.io'],
            [nile, 3_448_148_188, 'https://nile.trongrid.io'],
            [shasta, 2_494_104_990, 'https://api.shasta.trongrid.io'],
        ] as const;

        for (const [chain, expectedId, expectedHost] of cases) {
            const publicClient = createPublicClientFromRoot({ chain, transport: http() });

            assert.strictEqual(publicClient.chain, chain);
            assert.equal(publicClient.chain?.id, expectedId);
            assert.equal(publicClient.transport?.type, 'http');
            assert.equal(publicClient.transport?.url, expectedHost);
            assert.equal(publicClient._tronWeb.fullNode.host, expectedHost);
            assert.equal(publicClient._tronWeb.solidityNode.host, expectedHost);
            assert.equal(publicClient._tronWeb.eventServer?.host, expectedHost);
        }
    });

    it('http transport url overrides the chain default', function () {
        const publicClient = createPublicClientFromRoot({
            chain: mainnet,
            transport: http('https://nile.trongrid.io'),
        });

        assert.equal(publicClient.transport?.url, 'https://nile.trongrid.io');
        assert.equal(publicClient._tronWeb.fullNode.host, 'https://nile.trongrid.io');
    });

    it('defineChain supports custom viem-style chain configs', function () {
        const privateChain = defineChain({
            id: 728_126_428,
            name: 'Private TRON Mainnet Mirror',
            nativeCurrency: {
                name: 'TRON',
                symbol: 'TRX',
                decimals: 6,
            },
            network: 'mainnet',
            rpcUrls: {
                default: {
                    http: ['https://private.trongrid.local'],
                },
            },
        });

        const publicClient = createPublicClientFromRoot({ chain: privateChain, transport: http() });

        assert.strictEqual(publicClient.chain, privateChain);
        assert.equal(publicClient.chain?.id, 728_126_428);
        assert.equal(publicClient.transport?.url, 'https://private.trongrid.local');
        assert.equal(publicClient._tronWeb.fullNode.host, 'https://private.trongrid.local');
    });

    it('createPublicClient filters write helpers from trx', function () {
        const publicClient = createPublicClient({ fullHost });

        // @ts-expect-error PublicClient.trx should not expose write helpers.
        publicClient.trx.sendTransaction;
        // @ts-expect-error PublicClient.trx should not expose signing helpers.
        publicClient.trx.sign;

        assert.isFunction(publicClient.trx.getCurrentBlock);
        assert.isFunction(publicClient.getBlock);
        assert.isFunction(publicClient.getBlockNumber);
        assert.isFunction(publicClient.getTransaction);
        assert.isFunction(publicClient.getBalance);
        assert.isFunction(publicClient.transactionBuilder.sendTrx);
        assert.isUndefined((publicClient.trx as any).sendTransaction);
        assert.isUndefined((publicClient.trx as any).sign);
        assert.isUndefined((publicClient.trx as any).signMessage);
    });

    it('createPublicClient exposes top-level query helpers', async function () {
        const publicClient = createPublicClientFromRoot({ chain: mainnet, transport: http() });
        const block = {
            blockID: 'block-id',
            block_header: {
                raw_data: {
                    number: 321,
                    parentHash: 'parent-hash',
                    timestamp: 1,
                    txTrieRoot: 'tx-trie-root',
                    version: 0,
                    witness_address: 'witness-address',
                },
                witness_signature: 'signature',
            },
        };
        const transaction = {
            raw_data: {
                contract: [],
            },
            raw_data_hex: '0xraw',
            ret: [{ contractRet: 'SUCCESS' }] as [{ contractRet: string }],
            signature: ['0xsig'],
            txID: 'tx-id',
        } as any;
        const account = { address: 'TAccountAddress', balance: 456 } as any;
        const transactionInfo = { id: 'tx-info' } as any;
        let blockArg: unknown;
        let transactionArg: unknown;
        let transactionInfoArg: unknown;
        let accountArg: unknown;
        let balanceArg: unknown;

        publicClient._tronWeb.trx.getBlock = async (input) => {
            blockArg = input;
            return block as any;
        };
        publicClient._tronWeb.trx.getCurrentBlock = async () => block as any;
        publicClient._tronWeb.trx.getTransaction = async (input) => {
            transactionArg = input;
            return transaction as any;
        };
        publicClient._tronWeb.trx.getTransactionInfo = async (input) => {
            transactionInfoArg = input;
            return transactionInfo;
        };
        publicClient._tronWeb.trx.getAccount = async (input) => {
            accountArg = input;
            return account;
        };
        publicClient._tronWeb.trx.getBalance = async (input) => {
            balanceArg = input;
            return 123;
        };

        assert.deepEqual(await publicClient.getBlock('latest'), block);
        assert.equal(blockArg, 'latest');
        assert.deepEqual(await publicClient.getBlock({ blockTag: 'latest' }), block);
        assert.equal(blockArg, 'latest');
        assert.deepEqual(await publicClient.getBlock({ blockNumber: 123 }), block);
        assert.equal(blockArg, 123);
        assert.deepEqual(await publicClient.getBlock({ blockHash: 'block-hash' }), block);
        assert.equal(blockArg, 'block-hash');
        assert.equal(await publicClient.getBlockNumber(), 321);
        assert.deepEqual(await publicClient.getTransaction('tx-id'), transaction);
        assert.equal(transactionArg, 'tx-id');
        assert.deepEqual(await publicClient.getTransaction({ hash: 'tx-hash' }), transaction);
        assert.equal(transactionArg, 'tx-hash');
        assert.deepEqual(await publicClient.getTransactionInfo({ txId: 'tx-info-id' }), transactionInfo);
        assert.equal(transactionInfoArg, 'tx-info-id');
        assert.deepEqual(await publicClient.getAccount({ address: 'TAccountAddress' }), account);
        assert.equal(accountArg, 'TAccountAddress');
        assert.equal(await publicClient.getBalance('TBalanceAddress'), 123);
        assert.equal(balanceArg, 'TBalanceAddress');
        assert.equal(await publicClient.getBalance({ address: 'TBalanceAddress2' }), 123);
        assert.equal(balanceArg, 'TBalanceAddress2');
    });

    it('createWalletClient keeps wallet write helpers', function () {
        const walletClient = createWalletClient({
            account: privateKeyToAccount(`0x${'1'.padStart(64, '0')}` as `0x${string}`),
            chain: nile,
            transport: http(),
        });

        assert.strictEqual(walletClient.chain, nile);
        assert.equal(walletClient.transport?.url, 'https://nile.trongrid.io');
        assert.equal(walletClient._tronWeb.fullNode.host, 'https://nile.trongrid.io');
        assert.isFunction(walletClient.getBlockNumber);
        assert.isFunction(walletClient.getTransaction);
        assert.isFunction(walletClient.sendTransaction);
        assert.isFunction(walletClient.trx.sendTransaction);
        assert.isFunction(walletClient.trx.sign);
    });
});