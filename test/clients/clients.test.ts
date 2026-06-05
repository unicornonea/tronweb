import { assert } from 'chai';

import { privateKeyToAccount } from '../../src/accounts/privateKeyToAccount.js';
import { fromHex, toHex } from '../../src/utils/address.js';
import { sha3 } from '../../src/utils/crypto.js';
import { encodeParams } from '../../src/utils/abi.js';
import { createPublicClient } from '../../src/clients/createPublicClient.js';
import { createWalletClient } from '../../src/clients/createWalletClient.js';
import { getContract } from '../../src/clients/getContract.js';
import { Trx } from '../../src/lib/trx.js';
import { HttpProvider } from '../../src/lib/providers/index.js';
import { mainnet, nile, shasta } from '../../src/clients/chains.js';
import * as tbActions from '../../src/lib/actions/transactionBuilder.js';
import * as trxActions from '../../src/lib/actions/trx.js';
import tronWebBuilder from '../helpers/tronWebBuilder.js';
import wait from '../helpers/wait.js';
import config from '../helpers/config.js';
import Contracts from '../fixtures/contracts.js';
import {
    createContract as createContractFromRoot,
    createPublicClient as createPublicClientFromRoot,
    createWalletClient as createWalletClientFromRoot,
    defineChain,
    getContract as getContractFromRoot,
    http,
    mainnet as mainnetFromRoot,
    nile as nileFromRoot,
    shasta as shastaFromRoot,
} from '../../src/index.js';
import liveConfig from '../helpers/config.js';
import { trcTokenOverloadAbi, trcTokenOverloadBytecode } from '../fixtures/trcTokenOverload.js';

const { FULL_NODE_API } = config;

describe('client factories', function () {
    const fullHost = 'http://127.0.0.1';
    const privateKey = `0x${'1'.padStart(64, '0')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const testTypedData = {
        domain: {
            name: 'TronWeb Test',
            version: '1',
            chainId: 728_126_428,
        },
        types: {
            Mail: [
                { name: 'from', type: 'string' },
                { name: 'contents', type: 'string' },
            ],
        },
        primaryType: 'Mail',
        message: {
            from: 'alice',
            contents: 'hello tron',
        },
    };
    const testEventAbi = [
        {
            type: 'event',
            name: 'Transfer',
            anonymous: false,
            inputs: [
                { indexed: true, name: 'from', type: 'address' },
                { indexed: false, name: 'to', type: 'address' },
                { indexed: false, name: 'value', type: 'uint256' },
            ],
        },
    ] as const;

    async function assertRejectsWithMessage(action: () => Promise<unknown>, message: string) {
        try {
            await action();
            assert.fail(`Expected rejection with message: ${message}`);
        } catch (error) {
            assert.instanceOf(error, Error);
            assert.equal((error as Error).message, message);
        }
    }

    // Shared on-chain fixture: deploy the TestRevert contract once against the node
    // configured in config.ts (FULL_NODE_API). TestRevert exposes setOwner(address)
    // (writable, reverts on a forbidden address), getOwner(uint256) (view, reverts
    // with "Wrong check" unless the arg is 1) and getOwner2(uint256) (view, reverts
    // with no message) — enough to exercise write, constant-call, read, estimate and
    // revert paths against a real node instead of a mocked provider.
    const onChainFullNode = new HttpProvider(FULL_NODE_API);
    const revertFixture = Contracts.testRevert;
    const getOwnerFragment = revertFixture.abi.find((f: any) => f.name === 'getOwner');
    const setOwnerFragment = revertFixture.abi.find((f: any) => f.name === 'setOwner');
    let deployer: ReturnType<typeof privateKeyToAccount>;
    let deployerHex: string;
    let funded: { b58: string[]; hex: string[]; pks: string[] };
    let onChainPublicClient: ReturnType<typeof createPublicClient>;
    let onChainWalletClient: ReturnType<typeof createWalletClient>;
    let revertAddress: string;
    let deployTxId: string;

    async function waitForReceipt(txId: string): Promise<any> {
        for (let i = 0; i < 20; i++) {
            const info: any = await onChainPublicClient.getTransactionInfo({ txId }).catch(() => ({}));
            if (info && Object.keys(info).length) return info;
            await wait(3);
        }
        throw new Error(`transaction not confirmed on chain: ${txId}`);
    }

    before(async function () {
        this.timeout(180000);

        funded = await tronWebBuilder.getTestAccounts(-1);
        const idx = funded.pks.findIndex((p) => /^(0x)?[0-9a-fA-F]{64}$/.test(p));
        const pk = funded.pks[idx].replace(/^0x/, '');
        deployerHex = funded.hex[idx];
        deployer = privateKeyToAccount(`0x${pk}` as `0x${string}`);

        onChainPublicClient = createPublicClient({ fullHost: FULL_NODE_API });
        onChainWalletClient = createWalletClient({ account: deployer, fullHost: FULL_NODE_API });

        const deployTx = await tbActions.createSmartContract(
            onChainFullNode,
            { abi: revertFixture.abi, bytecode: revertFixture.bytecode, feeLimit: 1_000_000_000 },
            deployerHex
        );
        const signedDeploy = await deployer.signTransaction(deployTx);
        await trxActions.sendRawTransaction(onChainFullNode, signedDeploy);
        deployTxId = deployTx.txID;
        await waitForReceipt(deployTxId);
        revertAddress = deployTx.contract_address;
    });

    it('exports client factories from the package root', function () {
        assert.strictEqual(createPublicClientFromRoot, createPublicClient);
        assert.strictEqual(createWalletClientFromRoot, createWalletClient);
        assert.strictEqual(getContractFromRoot, getContract);
        assert.strictEqual(createContractFromRoot, getContractFromRoot);
        assert.strictEqual(mainnetFromRoot, mainnet);
        assert.strictEqual(nileFromRoot, nile);
        assert.strictEqual(shastaFromRoot, shasta);
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
            assert.equal(publicClient.key, 'public');
            assert.equal(publicClient.name, 'Public Client');
            assert.equal(publicClient.type, 'publicClient');
            assert.isString(publicClient.uid);
            assert.isNotEmpty(publicClient.uid);
            assert.equal(publicClient.chain?.id, expectedId);
            assert.equal(publicClient.transport?.type, 'http');
            assert.equal(publicClient.transport?.url, expectedHost);
        }
    });

    it('http transport url overrides the chain default', function () {
        const publicClient = createPublicClientFromRoot({
            chain: mainnet,
            transport: http('https://nile.trongrid.io'),
            key: 'custom-public',
            name: 'Custom Public Client',
        });

        assert.equal(publicClient.key, 'custom-public');
        assert.equal(publicClient.name, 'Custom Public Client');
        assert.equal(publicClient.transport?.url, 'https://nile.trongrid.io');
    });

    it('assigns a unique uid to each client instance', function () {
        const first = createPublicClientFromRoot({ chain: mainnet, transport: http() });
        const second = createPublicClientFromRoot({ chain: mainnet, transport: http() });

        assert.isString(first.uid);
        assert.isString(second.uid);
        assert.notEqual(first.uid, second.uid);
    });

    it('defineChain supports custom chain configs', function () {
        const privateChain = defineChain({
            id: 728_126_428,
            name: 'Private TRON Mainnet Mirror',
            nativeCurrency: { name: 'TRON', symbol: 'TRX', decimals: 6 },
            network: 'mainnet',
            rpcUrls: { default: { http: ['https://private.trongrid.local'] } },
        });

        const publicClient = createPublicClientFromRoot({ chain: privateChain, transport: http() });

        assert.strictEqual(publicClient.chain, privateChain);
        assert.equal(publicClient.chain?.id, 728_126_428);
        assert.equal(publicClient.transport?.url, 'https://private.trongrid.local');
    });

    it('PublicClient no longer exposes trx or transactionBuilder', function () {
        const publicClient = createPublicClient({ fullHost });
        assert.isUndefined((publicClient as any).trx);
        assert.isUndefined((publicClient as any).transactionBuilder);
    });

    it('WalletClient no longer exposes trx or transactionBuilder', function () {
        const walletClient = createWalletClient({ account, fullHost });
        assert.isUndefined((walletClient as any).trx);
        assert.isUndefined((walletClient as any).transactionBuilder);
    });

    it('createPublicClient exposes top-level query helpers', async function () {
        this.timeout(120000);
        // chain configures getChainId; fullHost points every node call at the live node.
        const publicClient = createPublicClient({ chain: mainnet, fullHost: FULL_NODE_API });
        const addrBody = (a: string) =>
            (/^(0x)?(41)?[0-9a-f]{40}$/i.test(a) ? a : toHex(a)).toLowerCase().replace(/^0x/, '').replace(/^41/, '');

        // Blocks
        const latest: any = await publicClient.getBlock('latest');
        assert.property(latest, 'block_header');
        const latestNum = latest.block_header.raw_data.number;
        assert.isAbove(latestNum, 0);
        assert.deepEqual(await publicClient.getBlock({ blockTag: 'latest' }), latest);
        const byNum: any = await publicClient.getBlock({ blockNumber: latestNum });
        assert.equal(byNum.block_header.raw_data.number, latestNum);
        const byHash: any = await publicClient.getBlock({ blockHash: latest.blockID });
        assert.equal(byHash.blockID, latest.blockID);

        // getChainId is derived from the configured chain (no node call)
        assert.equal(await publicClient.getChainId(), 728_126_428);

        assert.isAtLeast(await publicClient.getBlockTransactionCount({ blockNumber: latestNum }), 0);
        assert.isAbove(await publicClient.getBlockNumber(), 0);

        // Transactions: the deploy tx from before() is confirmed on chain
        const tx: any = await publicClient.getTransaction(deployTxId);
        assert.equal(String(tx.txID).toLowerCase(), deployTxId.toLowerCase());
        const tx2: any = await publicClient.getTransaction({ hash: deployTxId });
        assert.equal(String(tx2.txID).toLowerCase(), deployTxId.toLowerCase());
        const info: any = await publicClient.getTransactionInfo({ txId: deployTxId });
        assert.isAbove(Object.keys(info).length, 0);
        const receipt: any = await publicClient.getTransactionReceipt({ hash: deployTxId });
        assert.isAbove(Object.keys(receipt).length, 0);
        const waited: any = await publicClient.waitForTransactionReceipt({
            hash: deployTxId,
            pollingInterval: 1000,
            timeout: 60000,
        });
        assert.isAbove(Object.keys(waited).length, 0);

        // Account / balance for the funded deployer
        const accountData: any = await publicClient.getAccount({ address: deployer.address });
        assert.isObject(accountData);
        assert.isAbove(await publicClient.getBalance(deployer.address), 0);
        assert.isAbove(await publicClient.getBalance({ address: deployer.address }), 0);

        // Raw constant call: getOwner(1) returns the (32-byte padded) owner address
        const callData = (sha3('getOwner(uint256)').slice(0, 10) +
            encodeParams(['uint256'], [1]).replace(/^0x/, '')) as `0x${string}`;
        const callResult = await publicClient.call({ to: revertAddress, data: callData, account: deployer.address });
        assert.match(callResult.data as string, /^0x[0-9a-f]{64}$/i);

        // readContract through the abi: getOwner(1) returns an address-shaped value
        const owner = await publicClient.readContract({
            address: revertAddress,
            abi: revertFixture.abi,
            functionName: 'getOwner',
            args: [1],
            account: deployer.address,
        });
        assert.lengthOf(addrBody(owner as string), 40);

        // estimateContractGas for a state-changing call returns positive energy
        const energy = await publicClient.estimateContractGas({
            address: revertAddress,
            abi: revertFixture.abi,
            functionName: 'setOwner',
            args: [deployer.address],
            account: deployer.address,
        });
        assert.typeOf(energy, 'bigint');
        assert.isAbove(Number(energy), 0);

        // Verify helpers are local crypto (no node)
        const messageSignature = await deployer.signMessage({ message: 'hello tron' });
        const typedDataSignature = await deployer.signTypedData(testTypedData);
        assert.isTrue(
            await publicClient.verifyMessage({ address: deployer.address, message: 'hello tron', signature: messageSignature })
        );
        assert.isFalse(
            await publicClient.verifyMessage({
                address: fromHex('410000000000000000000000000000000000000000'),
                message: 'hello tron',
                signature: messageSignature,
            })
        );
        assert.isTrue(
            await publicClient.verifyTypedData({
                address: deployer.address,
                domain: testTypedData.domain,
                types: testTypedData.types,
                primaryType: testTypedData.primaryType,
                message: testTypedData.message,
                signature: typedDataSignature,
            })
        );
    });

    it('getBalance/getAccount default to the wallet address (audit #8)', async function () {
        this.timeout(60000);

        // The wallet client plumbs defaultAddress = deployer.address, so a no-arg call
        // resolves to it — matching legacy trx.getBalance(address = tronWeb.defaultAddress.hex).
        const walletClient = createWalletClient({ account: deployer, fullHost: FULL_NODE_API });
        const publicClient = createPublicClient({ fullHost: FULL_NODE_API });

        assert.equal(await walletClient.getBalance(), await walletClient.getBalance(deployer.address));
        assert.isObject(await walletClient.getAccount());

        // A public client has no default address, so a no-arg call must still require one.
        let threw = false;
        try {
            await publicClient.getBalance();
        } catch {
            threw = true;
        }
        assert.isTrue(threw, 'public getBalance() with no default address should throw');
    });

    it('createWalletClient exposes the expected method surface', function () {
        const walletClient = createWalletClient({ account, chain: nile, transport: http() });

        assert.strictEqual(walletClient.chain, nile);
        assert.equal(walletClient.key, 'wallet');
        assert.equal(walletClient.name, 'Wallet Client');
        assert.equal(walletClient.type, 'walletClient');
        assert.isString(walletClient.uid);
        assert.isNotEmpty(walletClient.uid);
        assert.equal(walletClient.transport?.url, 'https://nile.trongrid.io');
        assert.equal(walletClient.account, account);
        assert.isFunction(walletClient.getChainId);
        assert.isFunction(walletClient.getBlockTransactionCount);
        assert.isFunction(walletClient.getTransactionReceipt);
        assert.isFunction(walletClient.waitForTransactionReceipt);
        assert.isFunction(walletClient.call);
        assert.isFunction(walletClient.estimateContractGas);
        assert.isFunction(walletClient.getLogs);
        assert.isFunction(walletClient.getContractEvents);
        assert.isFunction(walletClient.readContract);
        assert.isFunction(walletClient.verifyMessage);
        assert.isFunction(walletClient.verifyTypedData);
        assert.isFunction(walletClient.getBlockNumber);
        assert.isFunction(walletClient.getTransaction);
        assert.isFunction(walletClient.getAddresses);
        assert.isFunction(walletClient.requestAddresses);
        assert.isFunction(walletClient.sendRawTransaction);
        assert.isFunction(walletClient.signMessage);
        assert.isFunction(walletClient.signTransaction);
        assert.isFunction(walletClient.signTypedData);
        assert.isFunction(walletClient.writeContract);
        assert.isFunction(walletClient.deployContract);
        assert.isFunction(walletClient.sendTransaction);
    });

    it('createWalletClient signMessage delegates to the account', async function () {
        const walletClient = createWalletClient({ account, fullHost });
        const signature = await walletClient.signMessage({ message: 'hello tron' });
        assert.equal(signature, await account.signMessage({ message: 'hello tron' }));
    });

    it('covers wallet client write helpers via writeContract / signTransaction / sendRawTransaction', async function () {
        this.timeout(120000);
        const walletClient = onChainWalletClient;
        const abi = revertFixture.abi;
        const other = funded.b58.find((a) => a !== deployer.address)!;
        const addrBody = (a: string) =>
            (/^(0x)?(41)?[0-9a-f]{40}$/i.test(a) ? a : toHex(a)).toLowerCase().replace(/^0x/, '').replace(/^41/, '');

        // local, no node interaction
        assert.deepEqual(await walletClient.getAddresses(), [deployer.address]);
        assert.deepEqual(await walletClient.requestAddresses(), [deployer.address]);
        assert.equal(
            await walletClient.signTypedData(testTypedData),
            await deployer.signTypedData(testTypedData)
        );

        // signTransaction signs a real node-built transaction, then sendRawTransaction
        // broadcasts it to the chain.
        const builtTrx = await tbActions.sendTrx(onChainFullNode, other, 1, deployer.address);
        const signedTrx: any = await walletClient.signTransaction({ transaction: builtTrx });
        assert.isArray(signedTrx.signature);
        assert.isNotEmpty(signedTrx.signature);
        const sendRawResult: any = await walletClient.sendRawTransaction({ transaction: signedTrx });
        assert.isTrue(sendRawResult.result === true || typeof sendRawResult.txid === 'string');

        // writeContract performs a real state-changing call (setOwner) and returns its txID
        const writeTxId = await walletClient.writeContract({
            address: revertAddress,
            abi,
            functionName: 'setOwner',
            args: [other],
            feeLimit: 1_000_000_000,
        });
        assert.isString(writeTxId);
        assert.isNotEmpty(writeTxId);
        const receipt = await waitForReceipt(writeTxId);
        assert.notEqual(receipt.result, 'FAILED', 'setOwner reverted on chain');

        // the write is observable on chain: getOwner(1) now returns the address we set
        const owner = await onChainPublicClient.readContract({
            address: revertAddress,
            abi,
            functionName: 'getOwner',
            args: [1],
            account: deployer.address,
        });
        assert.equal(addrBody(owner as string), addrBody(other));

        // client-side guards (these throw before any node request)
        await assertRejectsWithMessage(
            () =>
                walletClient.writeContract({
                    address: revertAddress,
                    abi,
                    functionName: 'getOwner',
                    args: [1],
                }),
            'Function "getOwner" is read-only.'
        );
        await assertRejectsWithMessage(
            () =>
                walletClient.writeContract({
                    address: revertAddress,
                    abi,
                    functionName: 'setOwner',
                    args: [other],
                    account: fromHex('410000000000000000000000000000000000000000'),
                }),
            'Wallet client account override must match the configured account.'
        );
        await assertRejectsWithMessage(
            () =>
                walletClient.deployContract({
                    abi,
                    bytecode: '0x60',
                    account: fromHex('410000000000000000000000000000000000000000'),
                }),
            'Wallet client account override must match the configured account.'
        );
    });

    it('defaults feeLimit for contract-building types dispatched via generic sendTransaction', async function () {
        this.timeout(90000);
        const walletClient = onChainWalletClient;
        const others = funded.b58.filter((a) => a !== deployer.address);

        // Omitting feeLimit in the raw options must fall back to the client default
        // instead of throwing "Invalid feeLimit provided": the generic dispatcher injects
        // the client feeLimit before the action validator runs. A successful broadcast
        // (no throw) proves the default was applied.
        const broadcast = await walletClient.sendTransaction({
            type: 'triggerSmartContract',
            parameters: [
                revertAddress,
                'setOwner(address)',
                { funcABIV2: setOwnerFragment, parametersV2: [others[0]] },
                [],
                deployer.address,
            ],
        });
        assert.isTrue(broadcast.result === true || typeof broadcast.txid === 'string');

        // An explicitly provided feeLimit works the same way.
        const explicit = await walletClient.sendTransaction({
            type: 'triggerSmartContract',
            parameters: [
                revertAddress,
                'setOwner(address)',
                { funcABIV2: setOwnerFragment, parametersV2: [others[1]], feeLimit: 1_000_000_000 },
                [],
                deployer.address,
            ],
        });
        assert.isTrue(explicit.result === true || typeof explicit.txid === 'string');
    });

    it('resolves overloaded ABI functions by argument arity', async function () {
        this.timeout(120000);
        // Deploy a real contract with store(uint256) and store(uint256,uint256) overloads
        // so overload resolution is exercised against the node instead of a mocked provider.
        const deployTx = await tbActions.createSmartContract(
            onChainFullNode,
            { abi: trcTokenOverloadAbi, bytecode: trcTokenOverloadBytecode, feeLimit: 1_000_000_000 },
            deployerHex
        );
        await trxActions.sendRawTransaction(onChainFullNode, await deployer.signTransaction(deployTx));
        await waitForReceipt(deployTx.txID);
        const address = deployTx.contract_address;

        const writeContract = getContract({ client: onChainWalletClient, abi: trcTokenOverloadAbi, address });
        const readContract = getContract({ client: onChainPublicClient, abi: trcTokenOverloadAbi, address });
        const readStored = async () =>
            String(await readContract.read.getStored([], { account: deployer.address }));

        // Both overloads are reachable through the getContract write namespace, and each
        // resolves to its OWN selector — proven by the distinct on-chain effect:
        //   store(uint256)          sets stored = a      (= 5)
        //   store(uint256,uint256)  sets stored = a + b  (= 12)  [previously unreachable]
        await waitForReceipt(await writeContract.write.store([5], { feeLimit: 1_000_000_000 }));
        assert.equal(await readStored(), '5');
        await waitForReceipt(await writeContract.write.store([5, 7], { feeLimit: 1_000_000_000 }));
        assert.equal(await readStored(), '12');

        // Arg-count validation is overload-aware (accepts any overload's arity, lists all).
        await assertRejectsWithMessage(
            () => (writeContract as any).write.store([1, 2, 3]),
            'Contract function "store" expects 1 or 2 argument(s) but received 3.'
        );
    });

    it('rejects a call value beyond the safe integer range (bigint guard)', async function () {
        // resolveCallValue throws before any node request, so a huge bigint value is
        // rejected regardless of the contract/method targeted (no deploy needed).
        const walletClient = createWalletClient({ account, fullHost: FULL_NODE_API });
        const publicClient = createPublicClient({ fullHost: FULL_NODE_API });
        const huge = 2n ** 60n; // > Number.MAX_SAFE_INTEGER, would silently truncate via Number()

        await assertRejectsWithMessage(
            () =>
                walletClient.writeContract({
                    address: account.address,
                    abi: revertFixture.abi as any,
                    functionName: 'setOwner',
                    args: [account.address],
                    value: huge,
                } as any),
            'call value exceeds safe integer range'
        );
        await assertRejectsWithMessage(
            () =>
                publicClient.readContract({
                    address: account.address,
                    abi: revertFixture.abi as any,
                    functionName: 'getOwner',
                    args: [1],
                    value: huge,
                    account: account.address,
                } as any),
            'call value exceeds safe integer range'
        );
    });

    it('throws when sendTransaction broadcast returns an error code', async function () {
        this.timeout(60000);
        const other = funded.b58.find((a) => a !== deployer.address)!;
        // Sign with an invalid signature so the node rejects the broadcast with a
        // SIGERROR code; sendTransaction must surface that as a thrown Error.
        const badAccount = {
            ...deployer,
            async signTransaction(transaction: any) {
                const signed: any = await deployer.signTransaction(transaction);
                return { ...signed, signature: ['0'.repeat(130)] };
            },
        };
        const walletClient = createWalletClient({ account: badAccount as any, fullHost: FULL_NODE_API });

        let threw = false;
        try {
            await walletClient.sendTransaction({
                type: 'sendTrx',
                parameters: [other, 1, deployer.address],
            });
        } catch (error) {
            threw = true;
            assert.instanceOf(error, Error);
            assert.isNotEmpty((error as Error).message);
        }
        assert.isTrue(threw, 'expected broadcast of a bad-signature transaction to throw');
    });

    it('returns the action result directly for constant/read-only sendTransaction types', async function () {
        this.timeout(60000);
        // Spy on signing so we can prove a constant call is never signed/broadcast.
        let signCalled = false;
        const spyAccount = {
            ...deployer,
            async signTransaction(transaction: any) {
                signCalled = true;
                return deployer.signTransaction(transaction);
            },
        };
        const walletClient = createWalletClient({ account: spyAccount as any, fullHost: FULL_NODE_API });

        // getOwner(1) is a view call against the real contract — it returns a constant
        // result wrapper, not a broadcastable transaction.
        const result = await walletClient.sendTransaction({
            type: 'triggerConstantContract',
            parameters: [
                revertAddress,
                'getOwner(uint256)',
                { funcABIV2: getOwnerFragment, parametersV2: [1] },
                [],
                deployer.address,
            ],
        });

        // The node's constant-call result is returned as-is: it carries result/constant_result
        // and is NOT a broadcast result (which would carry a txid).
        assert.isTrue(result.result.result, 'constant call should succeed on chain');
        assert.isArray(result.constant_result, 'constant call result must be returned directly');
        assert.match(result.constant_result[0], /^[0-9a-f]{64}$/i);
        assert.isUndefined((result as any).txid, 'must not be a broadcast result');
        assert.isFalse(signCalled, 'constant calls must not be signed');
    });

    it('validates chain id and block transaction count inputs', async function () {
        this.timeout(30000);
        // onChainPublicClient has no chain configured, so getChainId must reject.
        const publicClient = onChainPublicClient;

        await assertRejectsWithMessage(() => publicClient.getChainId(), 'getChainId requires a configured chain.');
        assert.isAtLeast(await publicClient.getBlockTransactionCount(), 0);
        await assertRejectsWithMessage(
            () =>
                publicClient.getBlockTransactionCount({
                    blockHash: 'block-hash',
                    blockNumber: 123,
                }),
            'getBlockTransactionCount requires at most one of blockHash, blockNumber, or blockTag.'
        );
    });

    it('validates transaction receipt helper inputs and timeout behavior', async function () {
        this.timeout(30000);
        const publicClient = onChainPublicClient;

        await assertRejectsWithMessage(
            () => publicClient.getTransactionReceipt({} as any),
            'getTransactionReceipt requires { hash }.'
        );
        await assertRejectsWithMessage(
            () => publicClient.waitForTransactionReceipt({} as any),
            'waitForTransactionReceipt requires { hash }.'
        );
        // A non-existent txID returns {} from the node forever, so a 0ms budget times out.
        const missingHash = 'f'.repeat(64);
        await assertRejectsWithMessage(
            () => publicClient.waitForTransactionReceipt({ hash: missingHash, pollingInterval: 0, timeout: 0 }),
            `Timed out waiting for transaction receipt for "${missingHash}".`
        );

        // Point at an unreachable node so getTransactionInfo throws a real connection
        // error; it must be surfaced as the "Last error:" suffix on the timeout message.
        const failingClient = createPublicClient({ fullHost: 'http://127.0.0.1:1' });
        let failingMessage = '';
        try {
            await failingClient.waitForTransactionReceipt({ hash: 'tx-failing-id', pollingInterval: 0, timeout: 0 });
            assert.fail('expected waitForTransactionReceipt to time out');
        } catch (error) {
            failingMessage = (error as Error).message;
        }
        assert.match(failingMessage, /^Timed out waiting for transaction receipt for "tx-failing-id"\. Last error:/);
    });

    it('covers verify helpers raw-message and mismatch branches', async function () {
        const publicClient = createPublicClientFromRoot({ chain: mainnet, transport: http() });
        const rawMessage = '0x68656c6c6f2074726f6e';
        const rawMessageSignature = await account.signMessage({ message: { raw: rawMessage } });
        const typedDataSignature = await account.signTypedData(testTypedData);

        assert.isTrue(
            await publicClient.verifyMessage({
                address: account.address,
                message: { raw: rawMessage },
                signature: rawMessageSignature,
            })
        );
        await assertRejectsWithMessage(
            () =>
                publicClient.verifyMessage({
                    address: account.address,
                    message: { raw: 'hello tron' as any },
                    signature: rawMessageSignature,
                }),
            'Invalid raw message: must be a 0x-prefixed hex string or Uint8Array'
        );
        assert.isFalse(
            await publicClient.verifyTypedData({
                address: fromHex('410000000000000000000000000000000000000000'),
                domain: testTypedData.domain,
                types: testTypedData.types,
                primaryType: testTypedData.primaryType,
                message: testTypedData.message,
                signature: typedDataSignature,
            })
        );
    });

    it('covers call, readContract, and estimateContractGas error branches', async function () {
        this.timeout(60000);
        const publicClient = onChainPublicClient;
        const abi = revertFixture.abi;
        // The contract reverts setOwner for this hard-coded forbidden address.
        const forbidden = fromHex('41b6e447d1d576de6c7f767c32a649f0ad50ae5975');

        // A real revert: getOwner(0) fails require(check == 1, "Wrong check"). On a live
        // node the action layer surfaces the node's revert message, so assert the call
        // throws a revert-related error.
        const revertData = (sha3('getOwner(uint256)').slice(0, 10) +
            encodeParams(['uint256'], [0]).replace(/^0x/, '')) as `0x${string}`;
        let callMsg = '';
        try {
            await publicClient.call({ to: revertAddress, data: revertData, account: deployer.address });
            assert.fail('expected the reverting call to throw');
        } catch (error) {
            callMsg = (error as Error).message;
        }
        assert.isNotEmpty(callMsg);
        assert.match(callMsg, /revert/i);

        // Client-side guards (throw before any node request)
        await assertRejectsWithMessage(
            () =>
                publicClient.readContract({
                    address: revertAddress,
                    abi,
                    functionName: 'setOwner',
                    args: [deployer.address],
                }),
            'Function "setOwner" is not read-only.'
        );
        await assertRejectsWithMessage(
            () =>
                publicClient.estimateContractGas({
                    address: revertAddress,
                    abi,
                    functionName: 'getOwner',
                    args: [1],
                }),
            'Function "getOwner" is read-only.'
        );

        // Estimating a reverting state-changing call (setOwner of the forbidden address)
        // fails: on a live node the revert is surfaced from the action layer.
        let estimateMsg = '';
        try {
            await publicClient.estimateContractGas({
                address: revertAddress,
                abi,
                functionName: 'setOwner',
                args: [forbidden],
                account: deployer.address,
            });
            assert.fail('expected estimateContractGas to reject for a reverting call');
        } catch (error) {
            estimateMsg = (error as Error).message;
        }
        assert.isNotEmpty(estimateMsg);
        assert.match(estimateMsg, /revert|estimate/i);
    });

    it('covers getLogs and getContractEvents edge cases for event queries', async function () {
        this.timeout(30000);
        const publicClient = onChainPublicClient;

        // TestRevert emits no events, so the live event server returns an empty data set.
        const logs = await publicClient.getLogs({ address: revertAddress });
        assert.isArray(logs.data);
        assert.lengthOf(logs.data, 0);

        // Client-side guard: filtering by args requires an eventName (throws before any request)
        await assertRejectsWithMessage(
            () =>
                publicClient.getContractEvents({
                    address: revertAddress,
                    abi: testEventAbi,
                    args: { from: deployer.address },
                }),
            'getContractEvents requires eventName when filtering args.'
        );
        const events = await publicClient.getContractEvents({
            address: revertAddress,
            abi: testEventAbi,
            eventName: 'Transfer',
            args: { from: fromHex('410000000000000000000000000000000000000000') },
        });
        assert.isArray(events.data);
        assert.lengthOf(events.data, 0);
    });

    // Verify is the other half of signing parity: the new public client and the legacy Trx must
    // agree on whether a signature matches an address. Both recover through the same utils, so an
    // agreement here proves the client wrapper does not diverge from the legacy verifier.
    describe('verify parity — public client vs legacy Trx', function () {
        const publicClient = createPublicClient({ fullHost });
        const wrongAddress = privateKeyToAccount(`0x${'2'.padStart(64, '0')}` as `0x${string}`).address;

        it('verifyMessage agrees with Trx.verifyMessageV2', async function () {
            const message = 'verify parity check';
            const signature = await account.signMessage({ message });

            assert.isTrue(await publicClient.verifyMessage({ address: account.address, message, signature }));
            assert.equal(Trx.verifyMessageV2(message, signature), account.address);

            assert.isFalse(await publicClient.verifyMessage({ address: wrongAddress, message, signature }));
            assert.notEqual(Trx.verifyMessageV2(message, signature), wrongAddress);
        });

        it('verifyTypedData agrees with Trx.verifyTypedData', async function () {
            const signature = await account.signTypedData(testTypedData);

            assert.isTrue(
                await publicClient.verifyTypedData({
                    address: account.address,
                    domain: testTypedData.domain,
                    types: testTypedData.types,
                    primaryType: testTypedData.primaryType,
                    message: testTypedData.message,
                    signature,
                })
            );
            assert.isTrue(
                Trx.verifyTypedData(
                    testTypedData.domain,
                    testTypedData.types,
                    testTypedData.message,
                    signature,
                    account.address
                )
            );

            assert.isFalse(
                await publicClient.verifyTypedData({
                    address: wrongAddress,
                    domain: testTypedData.domain,
                    types: testTypedData.types,
                    primaryType: testTypedData.primaryType,
                    message: testTypedData.message,
                    signature,
                })
            );
            assert.isFalse(
                Trx.verifyTypedData(
                    testTypedData.domain,
                    testTypedData.types,
                    testTypedData.message,
                    signature,
                    wrongAddress
                )
            );
        });
    });
});

// Contract-interaction coverage that runs against a real local TRE node (port 9090)
// instead of the mocked provider above: deploy a real contract, send real
// transactions, and assert on-chain results.
describe('client factories — live TRE @9090', function () {
    this.timeout(180000);
    const FULL_HOST = liveConfig.FULL_NODE_API;

    let deployer: ReturnType<typeof privateKeyToAccount>;
    // Typed as `any`: the calls below pass `abi as any`, so the precise generic
    // contract typing would otherwise resolve functionName/args to `never`.
    let livePublicClient: any;
    let liveWalletClient: any;
    let deployedAddress: string;

    async function waitForReceipt(txId: string): Promise<any> {
        for (let i = 0; i < 20; i++) {
            const info: any = await livePublicClient.getTransactionInfo({ txId }).catch(() => ({}));
            if (info && Object.keys(info).length) return info;
            await wait(3);
        }
        throw new Error(`transaction not confirmed on chain: ${txId}`);
    }

    async function readStored(): Promise<string> {
        return String(
            await livePublicClient.readContract({
                address: deployedAddress,
                abi: trcTokenOverloadAbi,
                functionName: 'getStored',
                args: [],
                account: deployer.address,
            })
        );
    }

    before(async function () {
        this.timeout(180000);

        const accounts = await tronWebBuilder.getTestAccounts(-1);
        const idx = accounts.pks.findIndex((p) => /^(0x)?[0-9a-fA-F]{64}$/.test(p));
        const pk = accounts.pks[idx].replace(/^0x/, '');
        const ownerHex = accounts.hex[idx];
        deployer = privateKeyToAccount(`0x${pk}` as `0x${string}`);
        livePublicClient = createPublicClient({ fullHost: FULL_HOST });
        liveWalletClient = createWalletClient({ account: deployer, fullHost: FULL_HOST });

        const fullNode = new HttpProvider(FULL_HOST);
        const deployTx = await tbActions.createSmartContract(
            fullNode,
            { abi: trcTokenOverloadAbi, bytecode: trcTokenOverloadBytecode, feeLimit: 1_000_000_000 },
            ownerHex
        );
        const signed = await deployer.signTransaction(deployTx);
        await trxActions.sendRawTransaction(fullNode, signed);
        await waitForReceipt(deployTx.txID);
        deployedAddress = deployTx.contract_address;
    });

    it('deploys a contract to the node and exposes its address', function () {
        assert.isString(deployedAddress);
        assert.isNotEmpty(deployedAddress);
    });

    it('writeContract then readContract round-trips through the real node', async function () {
        const txid = await liveWalletClient.writeContract({
            address: deployedAddress,
            abi: trcTokenOverloadAbi,
            functionName: 'store',
            args: [5],
            feeLimit: 1_000_000_000,
        });
        assert.isString(txid);
        const receipt = await waitForReceipt(txid);
        assert.notEqual(receipt.result, 'FAILED');
        assert.equal(await readStored(), '5');
    });

    it('resolves the store(uint256,uint256) overload by arity against the real contract', async function () {
        // The 2-arg overload (previously unreachable) sets stored = a + b = 12.
        const receipt = await waitForReceipt(
            await liveWalletClient.writeContract({
                address: deployedAddress,
                abi: trcTokenOverloadAbi,
                functionName: 'store',
                args: [5, 7],
                feeLimit: 1_000_000_000,
            })
        );
        assert.notEqual(receipt.result, 'FAILED');
        assert.equal(await readStored(), '12');
    });

    it('encodes a trcToken parameter with the correct on-chain selector', async function () {
        const tokenId = 1_000_001;
        const amount = 4242;
        const receipt = await waitForReceipt(
            await liveWalletClient.writeContract({
                address: deployedAddress,
                abi: trcTokenOverloadAbi,
                functionName: 'recordToken',
                args: [deployer.address, tokenId, amount],
                feeLimit: 1_000_000_000,
            })
        );
        assert.notEqual(receipt.result, 'FAILED', 'recordToken reverted — wrong selector?');

        const storedAmount = await livePublicClient.readContract({
            address: deployedAddress,
            abi: trcTokenOverloadAbi,
            functionName: 'getAmount',
            args: [],
            account: deployer.address,
        });
        const storedToken = await livePublicClient.readContract({
            address: deployedAddress,
            abi: trcTokenOverloadAbi,
            functionName: 'getToken',
            args: [],
            account: deployer.address,
        });
        assert.equal(String(storedAmount), String(amount));
        assert.equal(String(storedToken), String(tokenId));
    });

    it('defaults feeLimit to 150 TRX when writeContract omits it', async function () {
        const txid = await liveWalletClient.writeContract({
            address: deployedAddress,
            abi: trcTokenOverloadAbi,
            functionName: 'store',
            args: [9],
        });
        await waitForReceipt(txid);
        const tx: any = await livePublicClient.getTransaction({ txId: txid });
        assert.equal(tx.raw_data.fee_limit, 150_000_000);
        assert.equal(await readStored(), '9');
    });

    it('estimateContractGas returns a positive energy estimate from the node', async function () {
        const energy = await livePublicClient.estimateContractGas({
            address: deployedAddress,
            abi: trcTokenOverloadAbi,
            functionName: 'store',
            args: [3],
            account: deployer.address,
        });
        assert.typeOf(energy, 'bigint');
        assert.isAbove(Number(energy), 0);
    });
});

// A broadcast failure shaped `{ result: false }` with no `code` is not something a
// real node reliably produces, so this guard is covered with a mocked provider.
describe('createWalletClient — broadcast result handling', function () {
    const account = privateKeyToAccount(`0x${'1'.padStart(64, '0')}` as `0x${string}`);

    it('treats a broadcast { result: false } with no code as a failure', async function () {
        const stubAccount = {
            ...account,
            async signTransaction(transaction: any) {
                return { ...transaction, signature: ['0xsig'] };
            },
        };
        const fullNode = new HttpProvider('http://127.0.0.1');
        (fullNode as any).request = async (url: string) => {
            if (url === 'wallet/getblock') {
                return { block_header: { raw_data: { number: 100, timestamp: 1_700_000_000_000 } }, blockID: '0'.repeat(64) };
            }
            if (url === 'wallet/broadcasttransaction') {
                return { result: false }; // failure carrying no `code`
            }
            throw new Error(`unexpected request to ${url}`);
        };
        const walletClient = createWalletClient({ account: stubAccount, fullNode, solidityNode: fullNode });

        const recipient = fromHex('410000000000000000000000000000000000000001');
        let message = '';
        try {
            await walletClient.sendTransaction({
                type: 'sendTrx',
                parameters: [recipient, 1, account.address],
            });
        } catch (error) {
            message = (error as Error).message;
        }
        assert.equal(message, 'Failed to broadcast transaction');
    });
});

describe('createWalletClient — writeContract argument defaulting', function () {
    const account = privateKeyToAccount(`0x${'1'.padStart(64, '0')}` as `0x${string}`);

    it('defaults omitted args to [] (audit #10) instead of encoding undefined', async function () {
        const fullNode = new HttpProvider('http://127.0.0.1');
        const walletClient = createWalletClient({ account, fullNode, solidityNode: fullNode });
        const capture = async (action: () => Promise<unknown>): Promise<string> => {
            try {
                await action();
                return '';
            } catch (error) {
                return (error as Error).message;
            }
        };

        // recordToken needs 3 args; the param encoding (which runs before any node
        // request) must treat an omitted `args` exactly like `args: []`, rather than
        // throwing an opaque error from encoding `undefined`.
        const omitted = await capture(() =>
            walletClient.writeContract({
                address: account.address,
                abi: trcTokenOverloadAbi as any,
                functionName: 'recordToken',
            } as any)
        );
        const empty = await capture(() =>
            walletClient.writeContract({
                address: account.address,
                abi: trcTokenOverloadAbi as any,
                functionName: 'recordToken',
                args: [],
            } as any)
        );

        assert.notEqual(omitted, '', 'expected recordToken without args to throw');
        assert.equal(omitted, empty);
    });
});
