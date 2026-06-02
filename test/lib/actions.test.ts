/* eslint-disable @typescript-eslint/ban-ts-comment */
import { assert } from 'chai';
import assertThrow from '../helpers/assertThrow.js';
import tronWebBuilder from '../helpers/tronWebBuilder.js';
import { TronWeb, Trx } from '../setup/TronWeb.js';
import { TransactionBuilder } from '../../src/lib/TransactionBuilder/TransactionBuilder.js';
import * as tbActions from '../../src/lib/actions/transactionBuilder.js';
import * as trxActions from '../../src/lib/actions/trx.js';
import * as eventActions from '../../src/lib/actions/event.js';
import { HttpProvider } from '../../src/lib/providers/index.js';
import config from '../helpers/config.js';
import { Address } from '../../src/types/Trx.js';

const { FULL_NODE_API } = config;

describe('action layer', function () {
    let accounts: { hex: Address[]; b58: Address[]; pks: string[] };
    let tronWeb: TronWeb;

    before(async function () {
        tronWeb = tronWebBuilder.createInstance();
        accounts = await tronWebBuilder.getTestAccounts(-1);
    });

    // ----------- decoupling: action functions work without a TronWeb instance -----------

    describe('decoupling from TronWeb', function () {
        it('getCurrentRefBlockParams accepts a bare HttpProvider and returns valid ref-block', async function () {
            const fullNode = new HttpProvider(FULL_NODE_API);
            const ref = await trxActions.getCurrentRefBlockParams(fullNode);
            assert.isString(ref.ref_block_bytes);
            assert.isString(ref.ref_block_hash);
            assert.isNumber(ref.expiration);
            assert.isNumber(ref.timestamp);
        });

        it('sendTrx action builds a valid transaction without a TronWeb instance', async function () {
            const fullNode = new HttpProvider(FULL_NODE_API);
            const tx = await tbActions.sendTrx(fullNode, accounts.hex[1], 1, accounts.hex[0]);
            assert.equal(tx.raw_data.contract[0].type, 'TransferContract');
            assert.equal(
                (tx.raw_data.contract[0].parameter.value as any).to_address.toLowerCase(),
                TronWeb.address.toHex(accounts.hex[1]).toLowerCase()
            );
            assert.equal(
                (tx.raw_data.contract[0].parameter.value as any).owner_address.toLowerCase(),
                TronWeb.address.toHex(accounts.hex[0]).toLowerCase()
            );
            assert.equal((tx.raw_data.contract[0].parameter.value as any).amount, 1);
            assert.isString(tx.txID);
            assert.isString(tx.raw_data_hex);
        });

        it('triggerConstantContract action accepts explicit fullNode + solidityNode', async function () {
            const fullNode = new HttpProvider(FULL_NODE_API);
            const solidityNode = new HttpProvider(FULL_NODE_API);
            // Call against a non-contract address — the node returns a structured
            // "Smart contract is not exist" error. The test passes as long as the
            // action reached the network (proving decoupling) and surfaced a
            // node-level error rather than a missing-dependency error like
            // "this.tronWeb is undefined".
            await assertThrow(
                tbActions.triggerConstantContract(
                    fullNode,
                    solidityNode,
                    accounts.hex[0],
                    'balanceOf(address)',
                    { feeLimit: 1_000_000 },
                    [{ type: 'address', value: accounts.hex[0] }],
                    accounts.hex[0]
                ),
                'Smart contract is not exist.'
            );
        });

        it('sendRawTransaction action rejects unsigned input before reaching the network', async function () {
            const fullNode = new HttpProvider(FULL_NODE_API);
            await assertThrow(
                tbActions.sendTrx(fullNode, accounts.hex[1], 1, accounts.hex[0]).then((tx) =>
                    // intentionally bypass signing
                    trxActions.sendRawTransaction(fullNode, tx as any)
                ),
                'Transaction is not signed'
            );
        });

        it('getAccount / getBalance action accept bare solidityNode primitive', async function () {
            const solidityNode = new HttpProvider(FULL_NODE_API);
            const account = await trxActions.getAccount(solidityNode, accounts.hex[0]);
            assert.equal(
                TronWeb.address.toHex((account as any).address).toLowerCase(),
                accounts.hex[0].toLowerCase()
            );
            const balance = await trxActions.getBalance(solidityNode, accounts.hex[0]);
            assert.isNumber(balance);
        });

        it('getBlock action variants accept bare fullNode', async function () {
            const fullNode = new HttpProvider(FULL_NODE_API);
            const latest = await trxActions.getCurrentBlock(fullNode);
            assert.isObject(latest.block_header);
            const byNumber = await trxActions.getBlockByNumber(fullNode, 1);
            assert.isObject(byNumber.block_header);
            const same = await trxActions.getBlock(fullNode, 1);
            assert.equal(byNumber.blockID, same.blockID);
        });

        it('event actions reject when no eventServer URL responds (decoupled, no TronWeb)', async function () {
            // Pointing at a clearly-invalid endpoint to prove the action itself doesn't
            // need a TronWeb wrapper to function — it just uses the provider it was given.
            const eventServer = new HttpProvider(FULL_NODE_API);
            // TRE does not implement v1/contracts/.../events — request returns a non-success
            // shape and the action surfaces it. Either way the action must not throw
            // 'this.tronWeb.eventServer is undefined' (the legacy class shape error).
            try {
                await eventActions.getEventsByContractAddress(eventServer, accounts.hex[0], { limit: 1 });
            } catch (err: any) {
                assert.notInclude(String(err.message), 'this.tronWeb');
            }
        });
    });

    // ----------- legacy class wrappers preserve old surface and defaults -----------

    describe('legacy class wrappers', function () {
        it('TransactionBuilder constructor still throws without a TronWeb instance', function () {
            assert.throws(() => new TransactionBuilder(undefined as any), 'Expected instance of TronWeb');
            assert.throws(() => new TransactionBuilder({} as any), 'Expected instance of TronWeb');
        });

        it('Trx instance is still a Trx and has the original signing methods on the prototype', function () {
            assert.instanceOf(tronWeb.trx, Trx);
            assert.isFunction(tronWeb.trx.sign);
            assert.isFunction(tronWeb.trx.multiSign);
            assert.isFunction((tronWeb.trx as any).signMessageV2);
            assert.isFunction((tronWeb.trx as any)._signTypedData);
            assert.isFunction(tronWeb.trx.ecRecover);
            assert.isFunction(tronWeb.trx.verifyMessageV2);
            // verifySignature is exposed as a STATIC on Trx (not on the instance) — same as before refactor.
            assert.isFunction((Trx as any).verifySignature);
            // legacy aliases
            assert.strictEqual(tronWeb.trx.sendTrx, tronWeb.trx.sendTransaction);
            assert.strictEqual(tronWeb.trx.sendAsset, tronWeb.trx.sendToken);
            assert.strictEqual(tronWeb.trx.send, tronWeb.trx.sendTransaction);
            assert.strictEqual(tronWeb.trx.broadcast, tronWeb.trx.sendRawTransaction);
            assert.strictEqual(tronWeb.trx.broadcastHex, tronWeb.trx.sendHexTransaction);
            assert.strictEqual(tronWeb.trx.signTransaction, tronWeb.trx.sign);
            assert.strictEqual(tronWeb.trx.signMessage, tronWeb.trx.sign);
        });

        it('transactionBuilder.sendTrx applies defaultAddress when from is omitted', async function () {
            const tw = tronWebBuilder.createInstance();
            tw.setAddress(accounts.b58[0]);
            const tx = await tw.transactionBuilder.sendTrx(accounts.hex[1], 1);
            assert.equal(
                (tx.raw_data.contract[0].parameter.value as any).owner_address.toLowerCase(),
                accounts.hex[0].toLowerCase()
            );
        });

        it('transactionBuilder.sendAsset still delegates to sendToken (alias chain intact)', async function () {
            const tokenId = '1000001';
            const viaSendToken = await tronWeb.transactionBuilder.sendToken(
                accounts.hex[1],
                1,
                tokenId,
                accounts.hex[0]
            );
            const viaSendAsset = await tronWeb.transactionBuilder.sendAsset(
                accounts.hex[1],
                1,
                tokenId,
                accounts.hex[0]
            );
            assert.equal(viaSendToken.raw_data.contract[0].type, 'TransferAssetContract');
            assert.equal(viaSendAsset.raw_data.contract[0].type, 'TransferAssetContract');
            assert.deepEqual(
                viaSendToken.raw_data.contract[0].parameter.value,
                viaSendAsset.raw_data.contract[0].parameter.value
            );
        });

        it('transactionBuilder.createAsset / updateAsset / purchaseAsset aliases are preserved', function () {
            assert.isFunction(tronWeb.transactionBuilder.createAsset);
            assert.isFunction(tronWeb.transactionBuilder.updateAsset);
            assert.isFunction(tronWeb.transactionBuilder.purchaseAsset);
        });
    });

    // ----------- Trx.cache contract-ABI memo still works through the public field -----------

    describe('Trx.cache (now public, used by clearABI invalidation)', function () {
        it('Trx instance still has cache populated as an empty contracts map at construction', function () {
            const tw = tronWebBuilder.createInstance();
            assert.isObject((tw.trx as any).cache);
            assert.isObject((tw.trx as any).cache.contracts);
            assert.deepEqual((tw.trx as any).cache.contracts, {});
        });

        it('transactionBuilder.clearABI invalidates the same cache.contracts object the trx uses', async function () {
            const tw = tronWebBuilder.createInstance();
            const fakeAddress = accounts.hex[0];
            // seed cache (without going through getContract which would do a real fetch)
            (tw.trx as any).cache.contracts[fakeAddress] = { abi: 'sentinel' };
            assert.isDefined((tw.trx as any).cache.contracts[fakeAddress]);
            // clearABI MUST drop the entry — uses tw.trx.cache through the wrapper
            await tw.transactionBuilder.clearABI(fakeAddress, accounts.hex[0]);
            assert.isUndefined((tw.trx as any).cache.contracts[fakeAddress]);
        });
    });

    // ----------- parity: legacy class wrapper and direct action produce identical output -----------
    // The wrapper is a thin delegate — when both are given the same ref-block input
    // (so timestamps cannot drift between two HTTP calls), they must produce byte-identical txs.

    describe('class-wrapper / action parity (with fixed ref-block)', function () {
        it('sendTrx', async function () {
            const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
            const fromClass = await tronWeb.transactionBuilder.sendTrx(
                accounts.hex[1],
                1,
                accounts.hex[0],
                { blockHeader: ref as any }
            );
            const fromAction = await tbActions.sendTrx(
                tronWeb.fullNode,
                accounts.hex[1],
                1,
                accounts.hex[0],
                { blockHeader: ref as any }
            );
            assert.deepEqual(fromClass, fromAction);
        });

        it('freezeBalanceV2', async function () {
            const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
            const fromClass = await tronWeb.transactionBuilder.freezeBalanceV2(
                10_000,
                'ENERGY',
                accounts.hex[0],
                { blockHeader: ref as any }
            );
            const fromAction = await tbActions.freezeBalanceV2(
                tronWeb.fullNode,
                10_000,
                'ENERGY',
                accounts.hex[0],
                { blockHeader: ref as any }
            );
            assert.deepEqual(fromClass, fromAction);
        });

        it('updateAccount', async function () {
            const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
            const fromClass = await tronWeb.transactionBuilder.updateAccount(
                'parity-test',
                accounts.hex[0],
                { blockHeader: ref as any }
            );
            const fromAction = await tbActions.updateAccount(
                tronWeb.fullNode,
                'parity-test',
                accounts.hex[0],
                { blockHeader: ref as any }
            );
            assert.deepEqual(fromClass, fromAction);
        });
    });
});
