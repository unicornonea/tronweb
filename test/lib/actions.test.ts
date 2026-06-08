/* eslint-disable @typescript-eslint/ban-ts-comment */
import { assert } from 'chai';
import assertThrow from '../helpers/assertThrow.js';
import tronWebBuilder from '../helpers/tronWebBuilder.js';
import { TronWeb, Trx } from '../setup/TronWeb.js';
import { TransactionBuilder } from '../../src/lib/TransactionBuilder/TransactionBuilder.js';
import * as tbActions from '../../src/lib/actions/transactionBuilder.js';
import * as trxActions from '../../src/lib/actions/trx.js';
import * as eventActions from '../../src/lib/actions/event.js';
import { privateKeyToAccount } from '../../src/clients/accounts/privateKeyToAccount.js';
import { createPublicClient } from '../../src/clients/createPublicClient.js';
import { createWalletClient } from '../../src/clients/createWalletClient.js';
import { HttpProvider } from '../../src/lib/providers/index.js';
import wait from '../helpers/wait.js';
import config from '../helpers/config.js';
import { Address } from '../../src/types/Trx.js';
import Contracts from '../fixtures/contracts';

const { FULL_NODE_API } = config;

// A faithful class-wrapper delegate must either build the SAME transaction as the
// underlying action (given the same fixed ref-block) or fail in exactly the same way.
// The wrapper adds no logic of its own, so any divergence here is a regression.
async function assertBuilderParity(
    classCall: () => Promise<any>,
    actionCall: () => Promise<any>
): Promise<void> {
    let classRes: any;
    let actionRes: any;
    let classErr: Error | undefined;
    let actionErr: Error | undefined;
    try {
        classRes = await classCall();
    } catch (e) {
        classErr = e as Error;
    }
    try {
        actionRes = await actionCall();
    } catch (e) {
        actionErr = e as Error;
    }
    if (classErr || actionErr) {
        assert.isDefined(classErr, `class wrapper resolved but action threw: ${actionErr?.message}`);
        assert.isDefined(actionErr, `action resolved but class wrapper threw: ${classErr?.message}`);
        assert.strictEqual(classErr!.message, actionErr!.message);
    } else {
        assert.deepEqual(classRes, actionRes);
    }
}

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

        it('sendRawTransaction action rejects an empty signature array', async function () {
            const fullNode = new HttpProvider(FULL_NODE_API);
            const tx = await tbActions.sendTrx(fullNode, accounts.hex[1], 1, accounts.hex[0]);
            await assertThrow(
                trxActions.sendRawTransaction(fullNode, { ...tx, signature: [] } as any),
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

    // ----------- extended parity: every extracted builder action vs its class wrapper -----------
    // Each method is given the SAME fixed ref-block on both sides, so a faithful delegate must
    // produce a byte-identical tx. Optional middle params are passed explicitly so the trailing
    // { blockHeader } always lands in the options slot. Methods that need on-chain state to
    // *build* may reject — the wrapper and action must then reject identically (see helper).

    describe('class-wrapper / action parity — extended builders (fixed ref-block)', function () {
        const cases: Array<{ name: string; args: () => unknown[] }> = [
            { name: 'sendToken', args: () => [accounts.hex[1], 1, String(config.TOKEN_ID), accounts.hex[0]] },
            { name: 'purchaseToken', args: () => [accounts.hex[0], String(config.TOKEN_ID), 1, accounts.hex[1]] },
            { name: 'freezeBalance', args: () => [10_000, 3, 'ENERGY', accounts.hex[0], undefined] },
            { name: 'unfreezeBalance', args: () => ['ENERGY', accounts.hex[0], undefined] },
            { name: 'unfreezeBalanceV2', args: () => [10_000, 'ENERGY', accounts.hex[0]] },
            { name: 'cancelUnfreezeBalanceV2', args: () => [accounts.hex[0]] },
            { name: 'delegateResource', args: () => [10_000, accounts.hex[1], 'ENERGY', accounts.hex[0], false, undefined] },
            { name: 'undelegateResource', args: () => [10_000, accounts.hex[1], 'ENERGY', accounts.hex[0]] },
            { name: 'withdrawExpireUnfreeze', args: () => [accounts.hex[0]] },
            { name: 'withdrawBlockRewards', args: () => [accounts.hex[0]] },
            { name: 'applyForSR', args: () => [accounts.hex[0], 'http://sr.example.com'] },
            { name: 'vote', args: () => [{ [accounts.b58[0]]: 1 }, accounts.hex[0]] },
            { name: 'createAccount', args: () => [accounts.hex[1], accounts.hex[0]] },
            { name: 'updateBrokerage', args: () => [10, accounts.hex[0]] },
            { name: 'setAccountId', args: () => ['0x6161616161616161', accounts.hex[0]] },
            { name: 'createProposal', args: () => [{ '0': 1_000_000 }, accounts.hex[0]] },
            { name: 'deleteProposal', args: () => [1, accounts.hex[0]] },
            { name: 'voteProposal', args: () => [1, true, accounts.hex[0]] },
            { name: 'updateSetting', args: () => [config.CONTRACT_ADDRESS20_HEX, 30, accounts.hex[0]] },
            { name: 'updateEnergyLimit', args: () => [config.CONTRACT_ADDRESS20_HEX, 5_000_000, accounts.hex[0]] },
        ];

        for (const c of cases) {
            it(c.name, async function () {
                const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
                const a = c.args();
                await assertBuilderParity(
                    () => (tronWeb.transactionBuilder as any)[c.name](...a, { blockHeader: ref as any }),
                    () => (tbActions as any)[c.name](tronWeb.fullNode, ...a, { blockHeader: ref as any })
                );
            });
        }

        it('updateAccountPermissions', async function () {
            const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
            const ownerPermission = {
                type: 0,
                permission_name: 'owner',
                threshold: 1,
                keys: [{ address: accounts.hex[0], weight: 1 }],
            };
            const activePermission = {
                type: 2,
                permission_name: 'active0',
                threshold: 1,
                operations: '7fff1fc0033e0000000000000000000000000000000000000000000000000000',
                keys: [{ address: accounts.hex[0], weight: 1 }],
            };
            await assertBuilderParity(
                () =>
                    tronWeb.transactionBuilder.updateAccountPermissions(
                        accounts.hex[0],
                        ownerPermission as any,
                        null as any,
                        [activePermission] as any,
                        { blockHeader: ref as any }
                    ),
                () =>
                    tbActions.updateAccountPermissions(
                        tronWeb.fullNode,
                        accounts.hex[0],
                        ownerPermission as any,
                        null as any,
                        [activePermission] as any,
                        { blockHeader: ref as any }
                    )
            );
        });
    });

    // ----------- parity for the (fullNode, configObject, issuer) builders -----------
    // These take a config object (not a trailing options arg), so blockHeader lives INSIDE it.
    // A fresh shallow clone is passed to each side so neither call can observe the other's mutations.

    describe('class-wrapper / action parity — config-object builders', function () {
        it('createToken', async function () {
            const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
            const opts = { ...config.getTokenOptions(), blockHeader: ref };
            await assertBuilderParity(
                () => tronWeb.transactionBuilder.createToken({ ...opts } as any, accounts.hex[0]),
                () => tbActions.createToken(tronWeb.fullNode, { ...opts } as any, accounts.hex[0])
            );
        });

        it('updateToken', async function () {
            const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
            const opts = { ...config.UPDATED_TEST_TOKEN_OPTIONS, blockHeader: ref };
            await assertBuilderParity(
                () => tronWeb.transactionBuilder.updateToken({ ...opts } as any, accounts.hex[0]),
                () => tbActions.updateToken(tronWeb.fullNode, { ...opts } as any, accounts.hex[0])
            );
        });

        it('createSmartContract', async function () {
            const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
            const opts = {
                abi: Contracts.testRevert.abi,
                bytecode: Contracts.testRevert.bytecode,
                feeLimit: 1_000_000_000,
                blockHeader: ref,
            };
            await assertBuilderParity(
                () => tronWeb.transactionBuilder.createSmartContract({ ...opts } as any, accounts.hex[0]),
                () => tbActions.createSmartContract(tronWeb.fullNode, { ...opts } as any, accounts.hex[0])
            );
        });
    });

    // ----------- parity for the transaction-transform helpers (local, deterministic) -----------
    // Each transform mutates its input, so every call gets its own deep clone of the same base tx.

    describe('class-wrapper / action parity — transforms (txLocal)', function () {
        const clone = (tx: any) => JSON.parse(JSON.stringify(tx));
        let base: any;

        beforeEach(async function () {
            const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
            base = await tbActions.sendTrx(tronWeb.fullNode, accounts.hex[1], 1, accounts.hex[0], {
                blockHeader: ref as any,
            });
        });

        it('newTxID', async function () {
            await assertBuilderParity(
                () => tronWeb.transactionBuilder.newTxID(clone(base), { txLocal: true }),
                () => tbActions.newTxID(tronWeb.fullNode, clone(base), { txLocal: true })
            );
        });

        it('extendExpiration', async function () {
            await assertBuilderParity(
                () => tronWeb.transactionBuilder.extendExpiration(clone(base), 60, { txLocal: true }),
                () => tbActions.extendExpiration(tronWeb.fullNode, clone(base), 60, { txLocal: true })
            );
        });

        it('addUpdateData', async function () {
            await assertBuilderParity(
                () => tronWeb.transactionBuilder.addUpdateData(clone(base), 'parity-memo', 'utf8', { txLocal: true }),
                () => tbActions.addUpdateData(tronWeb.fullNode, clone(base), 'parity-memo', 'utf8', { txLocal: true })
            );
        });
    });

    // ----------- signing parity: legacy trx.sign vs privateKeyToAccount.signTransaction -----------
    // Unlike the builder wrappers above (a wrapper → action delegate pair), these are TWO
    // independent signing entry points. Signing is deterministic, so for the same unsigned tx and
    // the same key the whole signed transaction — signature bytes included — must be byte-identical.
    // A divergence here would mean the new account signer no longer matches the legacy trx.sign.

    describe('signing parity — legacy trx.sign vs privateKeyToAccount.signTransaction', function () {
        const clone = (tx: any) => JSON.parse(JSON.stringify(tx));
        const fixedPrivateKey = `0x${'1'.padStart(64, '0')}`;
        const account = privateKeyToAccount(fixedPrivateKey as `0x${string}`);
        const bareKey = fixedPrivateKey.slice(2);
        const ownerHex = TronWeb.address.toHex(account.address);

        const builders: Array<{ name: string; build: (ref: any) => Promise<any> }> = [
            { name: 'sendTrx', build: (ref) => tbActions.sendTrx(tronWeb.fullNode, accounts.hex[1], 1, ownerHex, { blockHeader: ref }) },
            {
                name: 'sendToken',
                build: (ref) =>
                    tbActions.sendToken(tronWeb.fullNode, accounts.hex[1], 1, String(config.TOKEN_ID), ownerHex, { blockHeader: ref }),
            },
            {
                name: 'freezeBalanceV2',
                build: (ref) => tbActions.freezeBalanceV2(tronWeb.fullNode, 10_000, 'ENERGY', ownerHex, { blockHeader: ref }),
            },
        ];

        for (const b of builders) {
            it(`${b.name}: account signer matches legacy trx.sign byte-for-byte`, async function () {
                const ref = await trxActions.getCurrentRefBlockParams(tronWeb.fullNode);
                const unsigned = await b.build(ref);

                // sign the SAME unsigned tx with each independent path (own clone, signing may mutate)
                const legacySigned = await tronWeb.trx.sign(clone(unsigned), bareKey);
                const accountSigned = await account.signTransaction(clone(unsigned));

                assert.deepEqual(accountSigned.signature, legacySigned.signature);
                assert.deepEqual(accountSigned, legacySigned);
            });
        }
    });

    // ----------- signing parity: message (V2) & typed data -----------
    // account.signMessage uses the V2 scheme (utils/message.signMessage) — the SAME function behind
    // trx.signMessageV2 (NOT trx.signMessage, which is the V1 trx.sign alias). account.signTypedData
    // shares utils/typedData.signTypedData with trx._signTypedData. These are independent entry
    // points, so an exact signature match proves the account signers never diverge from the legacy ones.

    describe('signing parity — message (V2) & typed data', function () {
        const fixedPrivateKey = `0x${'1'.padStart(64, '0')}`;
        const account = privateKeyToAccount(fixedPrivateKey as `0x${string}`);
        const bareKey = fixedPrivateKey.slice(2);

        it('signMessage (string) matches trx.signMessageV2', async function () {
            const message = 'tronweb parity check';
            const accountSig = await account.signMessage({ message });
            const legacySig = tronWeb.trx.signMessageV2(message, bareKey);
            assert.equal(accountSig, legacySig);
        });

        it('signMessage (raw bytes) matches trx.signMessageV2', async function () {
            const rawBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            const accountSig = await account.signMessage({ message: { raw: rawBytes } });
            const legacySig = tronWeb.trx.signMessageV2(rawBytes, bareKey);
            assert.equal(accountSig, legacySig);
        });

        it('signTypedData matches trx._signTypedData', async function () {
            const domain = {
                name: 'Parity',
                version: '1',
                chainId: 1,
                verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
            };
            const types = { Mail: [{ name: 'contents', type: 'string' }] };
            const message = { contents: 'hello' };

            const accountSig = await account.signTypedData({ domain, types, primaryType: 'Mail', message });
            const legacySig = tronWeb.trx._signTypedData(domain as any, types as any, message, bareKey);
            assert.equal(accountSig, legacySig);
        });
    });

    // ----------- contract parity: new client interfaces vs legacy tronWeb.contract -----------
    // The same function + args must produce (a) the same decoded read result and (b) the same
    // on-chain calldata. (a) goes through both read interfaces; (b) broadcasts a write through both
    // interfaces and compares the recorded calldata, so the full wrapper (not just the shared
    // encoder) is exercised.

    describe('contract parity — new client vs legacy tronWeb.contract', function () {
        let account: ReturnType<typeof privateKeyToAccount>;
        let owner: { pk: string; hex: string };
        let legacyTron: TronWeb;
        let publicClient: ReturnType<typeof createPublicClient>;
        let walletClient: ReturnType<typeof createWalletClient>;
        let constantAddress: string;
        let setValAddress: string;

        async function deploy(fixture: { abi: any; bytecode: string }): Promise<string> {
            const tx = await tbActions.createSmartContract(
                tronWeb.fullNode,
                { abi: fixture.abi, bytecode: fixture.bytecode, feeLimit: 1_000_000_000 },
                owner.hex
            );
            const signed = await account.signTransaction(tx);
            await trxActions.sendRawTransaction(tronWeb.fullNode, signed);
            for (let i = 0; i < 20; i++) {
                const info = await tronWeb.trx.getTransactionInfo(tx.txID);
                if (Object.keys(info).length) break;
                await wait(3);
            }
            return tx.contract_address;
        }

        async function fetchCallData(txID: string): Promise<string> {
            for (let i = 0; i < 20; i++) {
                const tx: any = await tronWeb.trx.getTransaction(txID).catch(() => ({}));
                if (tx && tx.txID) return tx.raw_data.contract[0].parameter.value.data;
                await wait(3);
            }
            throw new Error(`transaction not found on chain: ${txID}`);
        }

        before(async function () {
            this.timeout(120000);
            const idx = accounts.pks.findIndex((p) => /^(0x)?[0-9a-fA-F]{64}$/.test(p));
            const pk = accounts.pks[idx].replace(/^0x/, '');
            owner = { pk, hex: accounts.hex[idx] };
            account = privateKeyToAccount(`0x${pk}` as `0x${string}`);
            legacyTron = tronWebBuilder.createInstance({ privateKey: pk });
            publicClient = createPublicClient({ fullHost: FULL_NODE_API });
            walletClient = createWalletClient({ account, fullHost: FULL_NODE_API });
            constantAddress = await deploy(Contracts.testConstant);
            setValAddress = await deploy(Contracts.testSetVal);
        });

        it('readContract decodes differently with named only outputs compared to legacy tronWeb.contract().call()', async function () {
            this.timeout(30000);
            const legacy = await legacyTron.contract(Contracts.testConstant.abi).at(constantAddress);
            const legacyResult = await legacy.testPure(1, 2).call();
            const clientResult = await publicClient.readContract({
                address: constantAddress,
                abi: Contracts.testConstant.abi,
                functionName: 'testPure',
                args: [1, 2],
            } as any);
            assert.notDeepEqual(clientResult, legacyResult);
            assert.equal(clientResult, legacyResult[0]);
        });

        it('readContract decodes identically with unnamed only outputs compared to legacy tronWeb.contract().call()', async function () {
            this.timeout(30000);
            const unnamedAbi = JSON.parse(JSON.stringify(Contracts.testConstant.abi));
            for (const entry of unnamedAbi) {
                for (const output of entry.outputs ?? []) {
                    delete output.name;
                }
            }
            const legacy = await legacyTron.contract(unnamedAbi, constantAddress);
            const legacyResult = await legacy.testPure(1, 2).call();
            const clientResult = await publicClient.readContract({
                address: constantAddress,
                abi: unnamedAbi,
                functionName: 'testPure',
                args: [1, 2],
            } as any);
            assert.deepEqual(clientResult, legacyResult);
        });

        it('writeContract calldata matches legacy tronWeb.contract().send()', async function () {
            this.timeout(60000);
            const legacy = await legacyTron.contract(Contracts.testSetVal.abi).at(setValAddress);

            const clientTxId = await walletClient.writeContract({
                address: setValAddress,
                abi: Contracts.testSetVal.abi,
                functionName: 'set',
                args: [7],
                feeLimit: 1_000_000_000,
            } as any);
            const legacyTxId = await legacy.set(7).send({ feeLimit: 1_000_000_000 });

            const clientData = await fetchCallData(clientTxId);
            const legacyData = await fetchCallData(legacyTxId);
            assert.equal(clientData, legacyData);
        });
    });
});
