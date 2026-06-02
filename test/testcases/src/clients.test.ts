import { assert } from 'chai';

import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js';
import { fromHex, toHex } from '../../../src/utils/address.js';
import { encodeParams } from '../../../src/utils/abi.js';
import { txJsonToPb, txPbToTxID, txPbToRawDataHex } from '../../../src/utils/transaction.js';
import { createPublicClient } from '../../../src/clients/createPublicClient.js';
import { createWalletClient } from '../../../src/clients/createWalletClient.js';
import { getContract } from '../../../src/clients/getContract.js';
import { Trx } from '../../../src/lib/trx.js';
import { HttpProvider } from '../../../src/lib/providers/index.js';
import { mainnet, nile, shasta } from '../../../src/chains/index.js';
import {
    createContract as createContractFromRoot,
    createPublicClient as createPublicClientFromRoot,
    createWalletClient as createWalletClientFromRoot,
    defineChain,
    getContract as getContractFromRoot,
    http,
} from '../../../src/index.js';

interface MockProvider {
    readonly provider: HttpProvider;
    readonly calls: Array<{ url: string; params: any; method: string }>;
    mock(url: string, handler: (params: any) => unknown | Promise<unknown>): void;
    mockMatch(matcher: RegExp, handler: (params: any) => unknown | Promise<unknown>): void;
}

function makeMockProvider(label: string): MockProvider {
    const calls: Array<{ url: string; params: any; method: string }> = [];
    const handlers = new Map<string, (params: any) => unknown | Promise<unknown>>();
    const matchers: Array<{ matcher: RegExp; handler: (params: any) => unknown | Promise<unknown> }> = [];
    const provider = new HttpProvider('http://127.0.0.1');
    (provider as any).request = async (url: string, params: unknown = {}, method = 'get') => {
        calls.push({ url, params, method });
        const exact = handlers.get(url);
        if (exact) return exact(params);
        for (const { matcher, handler } of matchers) {
            if (matcher.test(url)) return handler(params);
        }
        throw new Error(`[${label}] unmocked request to ${url}`);
    };
    return {
        provider,
        calls,
        mock(url, handler) {
            handlers.set(url, handler);
        },
        mockMatch(matcher, handler) {
            matchers.push({ matcher, handler });
        },
    };
}

describe('client factories', function () {
    const fullHost = 'http://127.0.0.1';
    const privateKey = `0x${'1'.padStart(64, '0')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    // Real TRON addresses for tests that hit the action-layer validators
    // (the old test surface mocked at the builder level, bypassing input validation).
    const contractAddress = account.address;
    const secondAddress = fromHex('410000000000000000000000000000000000000001');
    const blockHash = '0'.repeat(64);
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
    const testReadContractAbi = [
        {
            type: 'function',
            name: 'balanceOf',
            stateMutability: 'view',
            inputs: [{ name: 'owner', type: 'address' }],
            outputs: [{ name: 'balance', type: 'uint256' }],
        },
    ] as const;
    const testWriteContractAbi = [
        {
            type: 'function',
            name: 'transfer',
            stateMutability: 'nonpayable',
            inputs: [
                { name: 'recipient', type: 'address' },
                { name: 'amount', type: 'uint256' },
            ],
            outputs: [],
        },
    ] as const;
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

    it('exports client factories from the package root', function () {
        assert.strictEqual(createPublicClientFromRoot, createPublicClient);
        assert.strictEqual(createWalletClientFromRoot, createWalletClient);
        assert.strictEqual(getContractFromRoot, getContract);
        assert.strictEqual(createContractFromRoot, getContractFromRoot);
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
            raw_data: { contract: [] },
            raw_data_hex: '0xraw',
            ret: [{ contractRet: 'SUCCESS' }] as [{ contractRet: string }],
            signature: ['0xsig'],
            txID: 'tx-id',
        } as any;
        const accountData = { address: 'TAccountAddress', balance: 456 } as any;
        const transactionInfo = { id: 'tx-info' } as any;
        let waitForReceiptCallCount = 0;

        const fullNode = makeMockProvider('fullNode');
        const solidityNode = makeMockProvider('solidityNode');
        const eventServer = makeMockProvider('eventServer');
        fullNode.mock('wallet/getnowblock', () => block);
        fullNode.mock('wallet/getblockbynum', () => block);
        fullNode.mock('wallet/getblockbyid', () => block);
        fullNode.mock('wallet/gettransactionbyid', () => transaction);
        fullNode.mock('wallet/triggerconstantcontract', (params: any) => {
            if (!params.function_selector || params.function_selector === '') {
                return {
                    result: { result: true },
                    transaction,
                    constant_result: [encodeParams(['uint256'], [7]).replace(/^0x/, '')],
                };
            }
            return {
                result: { result: true },
                transaction,
                constant_result: [encodeParams(['uint256'], [42]).replace(/^0x/, '')],
            };
        });
        fullNode.mock('wallet/estimateenergy', () => ({
            result: { result: true },
            energy_required: 88,
        }));
        solidityNode.mock('walletsolidity/getaccount', () => accountData);
        solidityNode.mock('walletsolidity/gettransactioninfobyid', (params: any) => {
            if (params.value === 'tx-wait-id') {
                waitForReceiptCallCount += 1;
                if (waitForReceiptCallCount < 2) return {};
            }
            return transactionInfo;
        });
        const eventResponse = {
            success: true,
            data: [
                {
                    block_number: 901,
                    block_timestamp: 1_700_000_000_000,
                    caller_contract_address: 'TCallerAddress',
                    contract_address: contractAddress,
                    event_index: 0,
                    event_name: 'Transfer',
                    result: {
                        from: toHex(account.address),
                        to: '410000000000000000000000000000000000000000',
                        value: '12',
                    },
                    result_type: { from: 'address', to: 'address', value: 'uint256' },
                    event: 'Transfer(address,address,uint256)',
                    transaction_id: 'event-tx-id-1',
                    _unconfirmed: false,
                },
                {
                    block_number: 902,
                    block_timestamp: 1_700_000_000_100,
                    caller_contract_address: 'TCallerAddress',
                    contract_address: contractAddress,
                    event_index: 1,
                    event_name: 'Transfer',
                    result: {
                        from: '410000000000000000000000000000000000000000',
                        to: toHex(account.address),
                        value: '24',
                    },
                    result_type: { from: 'address', to: 'address', value: 'uint256' },
                    event: 'Transfer(address,address,uint256)',
                    transaction_id: 'event-tx-id-2',
                    _unconfirmed: false,
                },
            ],
            meta: { at: 1_700_000_001_000, fingerprint: 'next-page-token', page_size: 2 },
        };
        eventServer.mockMatch(/^v1\/contracts\/.+\/events/, () => eventResponse);

        const publicClient = createPublicClient({
            chain: mainnet,
            fullNode: fullNode.provider,
            solidityNode: solidityNode.provider,
            eventServer: eventServer.provider,
        });

        const messageSignature = await account.signMessage({ message: 'hello tron' });
        const typedDataSignature = await account.signTypedData(testTypedData as any);
        const rawCallData = '0x70a08231000000000000000000000000d6206d4fa36d8f8f4f4d4c0b2cb0f6b99f3613a6' as const;
        const expectedCallResultData = encodeParams(['uint256'], [7]) as `0x${string}`;

        assert.deepEqual(await publicClient.getBlock('latest'), block);
        assert.deepEqual(await publicClient.getBlock({ blockTag: 'latest' }), block);
        assert.deepEqual(await publicClient.getBlock({ blockNumber: 123 }), block);
        assert.deepEqual(await publicClient.getBlock({ blockHash }), block);
        assert.equal(await publicClient.getChainId(), 728_126_428);
        const lastBlockByNum = fullNode.calls.find((c) => c.url === 'wallet/getblockbynum');
        assert.equal(lastBlockByNum?.params.num, 123);
        assert.equal(await publicClient.getBlockTransactionCount({ blockNumber: 333 }), 0);
        assert.equal(await publicClient.getBlockNumber(), 321);
        assert.deepEqual(await publicClient.getTransaction('tx-id'), transaction);
        assert.deepEqual(await publicClient.getTransaction({ hash: 'tx-hash' }), transaction);
        assert.deepEqual(await publicClient.getTransactionInfo({ txId: 'tx-info-id' }), transactionInfo);
        assert.deepEqual(await publicClient.getTransactionReceipt({ hash: 'tx-receipt-id' }), transactionInfo);
        assert.deepEqual(
            await publicClient.waitForTransactionReceipt({ hash: 'tx-wait-id', pollingInterval: 0, timeout: 100 }),
            transactionInfo
        );
        assert.deepEqual(await publicClient.getAccount({ address: account.address }), accountData);
        assert.equal(await publicClient.getBalance(account.address), 456);
        assert.equal(await publicClient.getBalance({ address: account.address }), 456);
        assert.deepEqual(
            await publicClient.call({
                to: contractAddress,
                data: rawCallData,
                account: account.address,
            }),
            { data: expectedCallResultData }
        );
        const callRequest = fullNode.calls.find(
            (c) => c.url === 'wallet/triggerconstantcontract' && c.params.data === rawCallData
        );
        assert.isOk(callRequest);
        assert.equal(toHex(callRequest!.params.owner_address), toHex(account.address));
        assert.equal(toHex(callRequest!.params.contract_address), toHex(contractAddress));

        assert.equal(
            String(
                await publicClient.readContract({
                    address: contractAddress,
                    abi: testReadContractAbi,
                    functionName: 'balanceOf',
                    args: [account.address],
                    account: account.address,
                })
            ),
            '42'
        );

        assert.equal(
            await publicClient.estimateContractGas({
                address: contractAddress,
                abi: testWriteContractAbi,
                functionName: 'transfer',
                args: [account.address, 12],
                account: account.address,
                value: 3n,
            }),
            88n
        );

        assert.deepEqual(
            await publicClient.getLogs({
                address: contractAddress,
                eventName: 'Transfer',
                onlyConfirmed: true,
                limit: 2,
            }),
            { data: eventResponse.data, meta: eventResponse.meta }
        );

        assert.deepEqual(
            await publicClient.getContractEvents({
                address: contractAddress,
                abi: testEventAbi,
                eventName: 'Transfer',
                args: { from: account.address },
                onlyConfirmed: true,
            }),
            { data: [eventResponse.data[0]], meta: eventResponse.meta }
        );

        assert.isTrue(
            await publicClient.verifyMessage({
                address: account.address,
                message: 'hello tron',
                signature: messageSignature,
            })
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
                address: account.address,
                domain: testTypedData.domain,
                types: testTypedData.types,
                primaryType: testTypedData.primaryType,
                message: testTypedData.message,
                signature: typedDataSignature,
            })
        );
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

    it('covers wallet client write helpers via writeContract / deployContract / sendTransaction / sendRawTransaction', async function () {
        const stubAccount = {
            ...account,
            async signTransaction(transaction: any) {
                return { ...transaction, signature: ['0xsignature'] };
            },
        };
        const fullNode = makeMockProvider('fullNode');
        const solidityNode = makeMockProvider('solidityNode');
        const broadcastCalls: any[] = [];
        fullNode.mock('wallet/getblock', () => ({
            block_header: { raw_data: { number: 1, timestamp: Date.now() } },
            blockID: '00000000000000000000000000000000',
        }));
        // Mimic a node response: build a real proto-encoded transaction so the
        // action layer's resultManagerTriggerSmartContract / txCheckWithArgs passes.
        // The encoded contract value must take the same encoding path as the
        // rebuilt-from-args version (i.e. mirror the args shape exactly).
        fullNode.mock('wallet/triggersmartcontract', (args: any) => {
            const tx = {
                visible: false,
                raw_data: {
                    contract: [
                        {
                            parameter: {
                                value: {
                                    contract_address: args.contract_address,
                                    owner_address: args.owner_address,
                                    call_value: args.call_value,
                                    ...(args.data ? { data: args.data } : {}),
                                    ...(args.function_selector ? { function_selector: args.function_selector } : {}),
                                    ...(args.parameter ? { parameter: args.parameter } : {}),
                                    ...(args.call_token_value ? { call_token_value: args.call_token_value } : {}),
                                    ...(args.token_id ? { token_id: args.token_id } : {}),
                                },
                                type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
                            },
                            type: 'TriggerSmartContract',
                        },
                    ],
                    ref_block_bytes: '0001',
                    ref_block_hash: '0000000000000000',
                    expiration: Date.now() + 60_000,
                    timestamp: Date.now(),
                    fee_limit: args.fee_limit,
                },
            };
            const pb = txJsonToPb(tx as any);
            return {
                result: { result: true },
                transaction: {
                    ...tx,
                    txID: txPbToTxID(pb).replace(/^0x/, ''),
                    raw_data_hex: txPbToRawDataHex(pb).toLowerCase(),
                },
            };
        });
        fullNode.mock('wallet/broadcasttransaction', (signed: any) => {
            broadcastCalls.push(signed);
            return { txid: signed.txID, code: 0, message: 'SUCCESS', result: true };
        });
        const walletClient = createWalletClient({
            account: stubAccount,
            fullNode: fullNode.provider,
            solidityNode: solidityNode.provider,
        });

        assert.deepEqual(await walletClient.getAddresses(), [account.address]);
        assert.deepEqual(await walletClient.requestAddresses(), [account.address]);

        const directTransaction = {
            txID: 'direct-tx-id',
            raw_data: {
                contract: [{ parameter: { value: { owner_address: toHex(account.address) } } }],
            },
        } as any;
        assert.deepEqual(await walletClient.signTransaction({ transaction: directTransaction }), {
            ...directTransaction,
            signature: ['0xsignature'],
        });
        assert.equal(
            await walletClient.signTypedData(testTypedData as any),
            await account.signTypedData(testTypedData as any)
        );

        const signedInputTransaction = {
            txID: 'signed-tx-id',
            raw_data: { contract: [] },
            signature: ['0xexisting'],
        } as any;
        const sendRawResult = await walletClient.sendRawTransaction({ transaction: signedInputTransaction });
        assert.equal(sendRawResult.txid, 'signed-tx-id');
        assert.strictEqual(broadcastCalls[0], signedInputTransaction);

        const writeTxId = await walletClient.writeContract({
            address: contractAddress,
            abi: testWriteContractAbi,
            functionName: 'transfer',
            args: [account.address, 12],
            value: 3n,
            feeLimit: 1_000,
        });
        assert.isString(writeTxId);
        assert.isNotEmpty(writeTxId);
        const triggerCall = fullNode.calls.find((c) => c.url === 'wallet/triggersmartcontract');
        assert.isOk(triggerCall);
        assert.equal(triggerCall!.params.fee_limit, 1_000);
        assert.equal(triggerCall!.params.call_value, 3);
        assert.equal(broadcastCalls[1].txID, writeTxId);
        assert.deepEqual(broadcastCalls[1].signature, ['0xsignature']);

        await assertRejectsWithMessage(
            () =>
                walletClient.writeContract({
                    address: contractAddress,
                    abi: testReadContractAbi,
                    functionName: 'balanceOf',
                    args: [account.address],
                } as any),
            'Function "balanceOf" is read-only.'
        );
        await assertRejectsWithMessage(
            () =>
                walletClient.writeContract({
                    address: contractAddress,
                    abi: testWriteContractAbi,
                    functionName: 'transfer',
                    args: [account.address, 1],
                    account: fromHex('410000000000000000000000000000000000000000'),
                }),
            'Wallet client account override must match the configured account.'
        );
        await assertRejectsWithMessage(
            () =>
                walletClient.deployContract({
                    abi: testWriteContractAbi,
                    bytecode: '0x60',
                    account: fromHex('410000000000000000000000000000000000000000'),
                }),
            'Wallet client account override must match the configured account.'
        );
    });

    it('throws when sendTransaction broadcast returns an error code', async function () {
        const stubAccount = {
            ...account,
            async signTransaction(transaction: any) {
                return { ...transaction, signature: ['0xsignature'] };
            },
        };
        const fullNode = makeMockProvider('fullNode');
        const solidityNode = makeMockProvider('solidityNode');
        fullNode.mock('wallet/getblock', () => ({
            block_header: { raw_data: { number: 1, timestamp: Date.now() } },
            blockID: '00000000000000000000000000000000',
        }));
        // sendTrx builder does NOT hit the node (just constructs the tx locally
        // after ref-block params from getblock). The broadcast returns an error.
        fullNode.mock('wallet/broadcasttransaction', () => ({
            code: 'SIGERROR',
            // hex-encoded 'bad-sig'
            message: '6261642d736967',
        }));
        const walletClient = createWalletClient({
            account: stubAccount,
            fullNode: fullNode.provider,
            solidityNode: solidityNode.provider,
        });

        await assertRejectsWithMessage(
            () =>
                walletClient.sendTransaction({
                    type: 'sendTrx',
                    parameters: [secondAddress, 1, account.address],
                }),
            'bad-sig'
        );
    });

    it('validates chain id and block transaction count inputs', async function () {
        const fullNode = makeMockProvider('fullNode');
        const solidityNode = makeMockProvider('solidityNode');
        fullNode.mock('wallet/getnowblock', () => ({
            block_header: { raw_data: { number: 1, timestamp: 1 } },
            blockID: 'block-id',
            transactions: [],
        }));
        const publicClient = createPublicClient({
            fullNode: fullNode.provider,
            solidityNode: solidityNode.provider,
        });

        await assertRejectsWithMessage(() => publicClient.getChainId(), 'getChainId requires a configured chain.');
        assert.equal(await publicClient.getBlockTransactionCount(), 0);
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
        const fullNode = makeMockProvider('fullNode');
        const solidityNode = makeMockProvider('solidityNode');
        solidityNode.mock('walletsolidity/gettransactioninfobyid', () => ({}));
        const publicClient = createPublicClient({
            fullNode: fullNode.provider,
            solidityNode: solidityNode.provider,
        });

        await assertRejectsWithMessage(
            () => publicClient.getTransactionReceipt({} as any),
            'getTransactionReceipt requires { hash }.'
        );
        await assertRejectsWithMessage(
            () => publicClient.waitForTransactionReceipt({} as any),
            'waitForTransactionReceipt requires { hash }.'
        );
        await assertRejectsWithMessage(
            () => publicClient.waitForTransactionReceipt({ hash: 'tx-timeout-id', pollingInterval: 0, timeout: 0 }),
            'Timed out waiting for transaction receipt for "tx-timeout-id".'
        );

        const failingFullNode = makeMockProvider('failingFullNode');
        const failingSolidityNode = makeMockProvider('failingSolidityNode');
        failingSolidityNode.mock('walletsolidity/gettransactioninfobyid', () => {
            throw new Error('node offline');
        });
        const failingClient = createPublicClient({
            fullNode: failingFullNode.provider,
            solidityNode: failingSolidityNode.provider,
        });
        await assertRejectsWithMessage(
            () => failingClient.waitForTransactionReceipt({ hash: 'tx-failing-id', pollingInterval: 0, timeout: 0 }),
            'Timed out waiting for transaction receipt for "tx-failing-id". Last error: node offline'
        );
    });

    it('covers verify helpers raw-message and mismatch branches', async function () {
        const publicClient = createPublicClientFromRoot({ chain: mainnet, transport: http() });
        const rawMessage = '0x68656c6c6f2074726f6e';
        const rawMessageSignature = await account.signMessage({ message: { raw: rawMessage } });
        const typedDataSignature = await account.signTypedData(testTypedData as any);

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
        const fullNode = makeMockProvider('fullNode');
        const solidityNode = makeMockProvider('solidityNode');
        fullNode.mock('wallet/triggerconstantcontract', () => ({
            result: { result: true },
            // 8 hex chars = revert selector with no payload
            constant_result: ['08c379a0'],
            transaction: {},
        }));
        fullNode.mock('wallet/estimateenergy', () => ({
            result: { result: false, message: '' },
        }));
        const publicClient = createPublicClient({
            fullNode: fullNode.provider,
            solidityNode: solidityNode.provider,
        });

        await assertRejectsWithMessage(
            () =>
                publicClient.call({
                    to: contractAddress,
                    account: account.address,
                    value: 5n,
                }),
            'The call has been reverted or has thrown an error.'
        );
        await assertRejectsWithMessage(
            () =>
                publicClient.readContract({
                    address: contractAddress,
                    abi: testWriteContractAbi,
                    functionName: 'transfer',
                    args: [account.address, 1],
                } as any),
            'Function "transfer" is not read-only.'
        );
        await assertRejectsWithMessage(
            () =>
                publicClient.estimateContractGas({
                    address: contractAddress,
                    abi: testReadContractAbi,
                    functionName: 'balanceOf',
                    args: [account.address],
                } as any),
            'Function "balanceOf" is read-only.'
        );
        await assertRejectsWithMessage(
            () =>
                publicClient.estimateContractGas({
                    address: contractAddress,
                    abi: testWriteContractAbi,
                    functionName: 'transfer',
                    args: [account.address, 1],
                }),
            'Failed to estimate contract energy.'
        );
    });

    it('covers getLogs and getContractEvents edge cases for event queries', async function () {
        const fullNode = makeMockProvider('fullNode');
        const solidityNode = makeMockProvider('solidityNode');
        const eventServer = makeMockProvider('eventServer');
        eventServer.mockMatch(/^v1\/contracts\/.+\/events/, () => ({ success: true, data: [] }));
        const publicClient = createPublicClient({
            fullNode: fullNode.provider,
            solidityNode: solidityNode.provider,
            eventServer: eventServer.provider,
        });

        assert.deepEqual(await publicClient.getLogs({ address: contractAddress }), { data: [] });

        await assertRejectsWithMessage(
            () =>
                publicClient.getContractEvents({
                    address: contractAddress,
                    abi: testEventAbi,
                    args: { from: account.address },
                }),
            'getContractEvents requires eventName when filtering args.'
        );
        assert.deepEqual(
            await publicClient.getContractEvents({
                address: contractAddress,
                abi: testEventAbi,
                eventName: 'Transfer',
                args: { from: fromHex('410000000000000000000000000000000000000000') },
            }),
            { data: [] }
        );
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
            const signature = await account.signTypedData(testTypedData as any);

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
                    testTypedData.domain as any,
                    testTypedData.types as any,
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
                    testTypedData.domain as any,
                    testTypedData.types as any,
                    testTypedData.message,
                    signature,
                    wrongAddress
                )
            );
        });
    });
});
