import { assert } from 'chai';

import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js';
import { fromHex, toHex } from '../../../src/utils/address.js';
import { encodeParams } from '../../../src/utils/abi.js';
import { createPublicClient } from '../../../src/clients/createPublicClient.js';
import { createWalletClient } from '../../../src/clients/createWalletClient.js';
import { getContract } from '../../../src/clients/getContract.js';
import { mainnet, nile, shasta } from '../../../src/chains/index.js';
import {
    createContract as createContractFromRoot,
    createPublicClient as createPublicClientFromRoot,
    createWalletClient as createWalletClientFromRoot,
    defineChain,
    getContract as getContractFromRoot,
    http,
} from '../../../src/index.js';

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
            assert.equal(publicClient._tronWeb.fullNode.host, expectedHost);
            assert.equal(publicClient._tronWeb.solidityNode.host, expectedHost);
            assert.equal(publicClient._tronWeb.eventServer?.host, expectedHost);
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
        assert.equal(publicClient._tronWeb.fullNode.host, 'https://nile.trongrid.io');
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
        const accountData = { address: 'TAccountAddress', balance: 456 } as any;
        const transactionInfo = { id: 'tx-info' } as any;
        let blockArg: unknown;
        let blockTransactionCountArg: unknown;
        let transactionArg: unknown;
        let transactionInfoArg: unknown;
        let accountArg: unknown;
        let balanceArg: unknown;
        let constantCallArgs: unknown[] | undefined;
        let estimateEnergyArgs: unknown[] | undefined;
        let eventLogsArgs: unknown[] | undefined;
        let transactionInfoCallCount = 0;

        const typedData = {
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
        const contractAbi = [
            {
                type: 'function',
                name: 'balanceOf',
                stateMutability: 'view',
                inputs: [{ name: 'owner', type: 'address' }],
                outputs: [{ name: 'balance', type: 'uint256' }],
            },
        ] as const;
        const writeContractAbi = [
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
        const eventAbi = [
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
        const rawCallData = '0x70a08231000000000000000000000000d6206d4fa36d8f8f4f4d4c0b2cb0f6b99f3613a6' as const;
        const expectedCallResultData = encodeParams(['uint256'], [7]) as `0x${string}`;
        const eventResponse = {
            success: true,
            data: [
                {
                    block_number: 901,
                    block_timestamp: 1_700_000_000_000,
                    caller_contract_address: 'TCallerAddress',
                    contract_address: 'TContractAddress',
                    event_index: 0,
                    event_name: 'Transfer',
                    result: {
                        from: toHex(account.address),
                        to: '410000000000000000000000000000000000000000',
                        value: '12',
                    },
                    result_type: {
                        from: 'address',
                        to: 'address',
                        value: 'uint256',
                    },
                    event: 'Transfer(address,address,uint256)',
                    transaction_id: 'event-tx-id-1',
                    _unconfirmed: false,
                },
                {
                    block_number: 902,
                    block_timestamp: 1_700_000_000_100,
                    caller_contract_address: 'TCallerAddress',
                    contract_address: 'TContractAddress',
                    event_index: 1,
                    event_name: 'Transfer',
                    result: {
                        from: '410000000000000000000000000000000000000000',
                        to: toHex(account.address),
                        value: '24',
                    },
                    result_type: {
                        from: 'address',
                        to: 'address',
                        value: 'uint256',
                    },
                    event: 'Transfer(address,address,uint256)',
                    transaction_id: 'event-tx-id-2',
                    _unconfirmed: false,
                },
            ],
            meta: {
                at: 1_700_000_001_000,
                fingerprint: 'next-page-token',
                page_size: 2,
            },
        };

        const messageSignature = await account.signMessage({ message: 'hello tron' });
        const typedDataSignature = await account.signTypedData(typedData as any);

        publicClient._tronWeb.trx.getBlock = async (input) => {
            blockArg = input;
            return block as any;
        };
        publicClient._tronWeb.trx.getBlockTransactionCount = async (input) => {
            blockTransactionCountArg = input;
            return 7;
        };
        publicClient._tronWeb.trx.getCurrentBlock = async () => block as any;
        publicClient._tronWeb.trx.getTransaction = async (input) => {
            transactionArg = input;
            return transaction as any;
        };
        publicClient._tronWeb.trx.getTransactionInfo = async (input) => {
            transactionInfoArg = input;
            if (input === 'tx-wait-id') {
                transactionInfoCallCount += 1;
            }
            if (input === 'tx-wait-id' && transactionInfoCallCount < 2) {
                throw new Error('pending');
            }
            return transactionInfo;
        };
        publicClient._tronWeb.trx.getAccount = async (input) => {
            accountArg = input;
            return accountData;
        };
        publicClient._tronWeb.trx.getBalance = async (input) => {
            balanceArg = input;
            return 123;
        };
        publicClient._tronWeb.transactionBuilder.triggerConstantContract = async (...args: unknown[]) => {
            constantCallArgs = args;
            const functionSelector = args[1] as string;

            if (functionSelector === '') {
                return {
                    result: { result: true },
                    transaction,
                    constant_result: [encodeParams(['uint256'], [7]).replace(/^0x/, '')],
                } as any;
            }

            return {
                result: { result: true },
                transaction,
                constant_result: [encodeParams(['uint256'], [42]).replace(/^0x/, '')],
            } as any;
        };
        publicClient._tronWeb.transactionBuilder.estimateEnergy = async (...args: unknown[]) => {
            estimateEnergyArgs = args;
            return {
                result: { result: true },
                energy_required: 88,
            } as any;
        };
        publicClient._tronWeb.event.getEventsByContractAddress = async (...args: unknown[]) => {
            eventLogsArgs = args;
            return eventResponse as any;
        };

        assert.deepEqual(await publicClient.getBlock('latest'), block);
        assert.equal(blockArg, 'latest');
        assert.deepEqual(await publicClient.getBlock({ blockTag: 'latest' }), block);
        assert.equal(blockArg, 'latest');
        assert.deepEqual(await publicClient.getBlock({ blockNumber: 123 }), block);
        assert.equal(blockArg, 123);
        assert.deepEqual(await publicClient.getBlock({ blockHash: 'block-hash' }), block);
        assert.equal(blockArg, 'block-hash');
        assert.equal(await publicClient.getChainId(), 728_126_428);
        assert.equal(await publicClient.getBlockTransactionCount({ blockNumber: 333 }), 7);
        assert.equal(blockTransactionCountArg, 333);
        assert.equal(await publicClient.getBlockNumber(), 321);
        assert.deepEqual(await publicClient.getTransaction('tx-id'), transaction);
        assert.equal(transactionArg, 'tx-id');
        assert.deepEqual(await publicClient.getTransaction({ hash: 'tx-hash' }), transaction);
        assert.equal(transactionArg, 'tx-hash');
        assert.deepEqual(await publicClient.getTransactionInfo({ txId: 'tx-info-id' }), transactionInfo);
        assert.equal(transactionInfoArg, 'tx-info-id');
        assert.deepEqual(await publicClient.getTransactionReceipt({ hash: 'tx-receipt-id' }), transactionInfo);
        assert.equal(transactionInfoArg, 'tx-receipt-id');
        assert.deepEqual(
            await publicClient.waitForTransactionReceipt({ hash: 'tx-wait-id', pollingInterval: 0, timeout: 100 }),
            transactionInfo
        );
        assert.equal(transactionInfoArg, 'tx-wait-id');
        assert.deepEqual(await publicClient.getAccount({ address: 'TAccountAddress' }), accountData);
        assert.equal(accountArg, 'TAccountAddress');
        assert.equal(await publicClient.getBalance('TBalanceAddress'), 123);
        assert.equal(balanceArg, 'TBalanceAddress');
        assert.equal(await publicClient.getBalance({ address: 'TBalanceAddress2' }), 123);
        assert.equal(balanceArg, 'TBalanceAddress2');
        assert.deepEqual(
            await publicClient.call({
                to: 'TContractAddress',
                data: rawCallData,
                account: account.address,
            }),
            { data: expectedCallResultData }
        );
        assert.deepEqual(constantCallArgs, [
            'TContractAddress',
            '',
            { input: rawCallData },
            [],
            account.address,
        ]);
        assert.equal(
            String(
                await publicClient.readContract({
                    address: 'TContractAddress',
                    abi: contractAbi,
                    functionName: 'balanceOf',
                    args: [account.address],
                    account: account.address,
                })
            ),
            '42'
        );
        assert.equal((constantCallArgs?.[1] as string) ?? '', 'balanceOf(address)');
        assert.deepEqual(constantCallArgs?.[2], {
            funcABIV2: contractAbi[0],
            parametersV2: [account.address],
        });
        assert.deepEqual(constantCallArgs?.[3], []);
        assert.equal(constantCallArgs?.[4], account.address);
        assert.equal(
            await publicClient.estimateContractGas({
                address: 'TContractAddress',
                abi: writeContractAbi,
                functionName: 'transfer',
                args: [account.address, 12],
                account: account.address,
                value: 3n,
            }),
            88n
        );
        assert.deepEqual(estimateEnergyArgs, [
            'TContractAddress',
            'transfer(address,uint256)',
            {
                callValue: 3,
                funcABIV2: writeContractAbi[0],
                parametersV2: [account.address, 12],
            },
            [],
            account.address,
        ]);
        assert.deepEqual(
            await publicClient.getLogs({
                address: 'TContractAddress',
                eventName: 'Transfer',
                minBlockTimestamp: 1_700_000_000_000,
                maxBlockTimestamp: 1_700_000_000_500,
                onlyConfirmed: true,
                orderBy: 'block_timestamp,asc',
                limit: 2,
                fingerprint: 'cursor-token',
            }),
            {
                data: eventResponse.data,
                meta: eventResponse.meta,
            }
        );
        assert.deepEqual(eventLogsArgs, [
            'TContractAddress',
            {
                eventName: 'Transfer',
                minBlockTimestamp: 1_700_000_000_000,
                maxBlockTimestamp: 1_700_000_000_500,
                onlyConfirmed: true,
                orderBy: 'block_timestamp,asc',
                limit: 2,
                fingerprint: 'cursor-token',
            },
        ]);
        assert.deepEqual(
            await publicClient.getContractEvents({
                address: 'TContractAddress',
                abi: eventAbi,
                eventName: 'Transfer',
                args: {
                    from: account.address,
                },
                onlyConfirmed: true,
            }),
            {
                data: [eventResponse.data[0]],
                meta: eventResponse.meta,
            }
        );
        assert.deepEqual(eventLogsArgs, [
            'TContractAddress',
            {
                eventName: 'Transfer',
                onlyConfirmed: true,
            },
        ]);
        assert.isTrue(await publicClient.verifyMessage({ address: account.address, message: 'hello tron', signature: messageSignature }));
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
                domain: typedData.domain,
                types: typedData.types,
                primaryType: typedData.primaryType,
                message: typedData.message,
                signature: typedDataSignature,
            })
        );
    });

    it('createWalletClient keeps wallet write helpers', function () {
        const walletClient = createWalletClient({
            account,
            chain: nile,
            transport: http(),
        });

        assert.strictEqual(walletClient.chain, nile);
        assert.equal(walletClient.key, 'wallet');
        assert.equal(walletClient.name, 'Wallet Client');
        assert.equal(walletClient.type, 'walletClient');
        assert.isString(walletClient.uid);
        assert.isNotEmpty(walletClient.uid);
        assert.equal(walletClient.transport?.url, 'https://nile.trongrid.io');
        assert.equal(walletClient._tronWeb.fullNode.host, 'https://nile.trongrid.io');
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
        assert.isFunction(walletClient.trx.sendTransaction);
        assert.isFunction(walletClient.trx.sign);
    });

    it('createWalletClient signMessage keeps signMessageV2 semantics', async function () {
        const walletClient = createWalletClient({
            account,
            fullHost,
        });

        const signature = await walletClient.signMessage({ message: 'hello tron' });

        assert.equal(signature, walletClient.trx.signMessageV2('hello tron', privateKey));
    });

    it('covers new wallet client top-level actions', async function () {
        const stubAccount = {
            ...account,
            async signTransaction(transaction: any) {
                return {
                    ...transaction,
                    signature: ['0xsignature'],
                };
            },
        };
        const walletClient = createWalletClient({
            account: stubAccount,
            fullHost,
        });
        const directTransaction = {
            txID: 'direct-tx-id',
            raw_data: {
                contract: [
                    {
                        parameter: {
                            value: {
                                owner_address: toHex(account.address),
                            },
                        },
                    },
                ],
            },
        } as any;
        const signedInputTransaction = {
            txID: 'signed-tx-id',
            raw_data: {
                contract: [],
            },
            signature: ['0xexisting'],
        } as any;
        const sendRawTransactionCalls: any[] = [];
        let triggerSmartContractArgs: unknown[] | undefined;
        let createSmartContractArgs: unknown[] | undefined;

        walletClient._tronWeb.trx.sendRawTransaction = async (transaction) => {
            sendRawTransactionCalls.push(transaction);
            return {
                txid: transaction.txID,
                code: 0,
                message: 'SUCCESS',
                result: true,
                transaction,
            } as any;
        };
        walletClient._tronWeb.transactionBuilder.triggerSmartContract = async (...args: unknown[]) => {
            triggerSmartContractArgs = args;
            return {
                result: { result: true },
                transaction: {
                    txID: 'write-tx-id',
                    raw_data: {
                        contract: [
                            {
                                parameter: {
                                    value: {
                                        owner_address: toHex(account.address),
                                    },
                                },
                            },
                        ],
                    },
                },
            } as any;
        };
        walletClient._tronWeb.transactionBuilder.createSmartContract = async (...args: unknown[]) => {
            createSmartContractArgs = args;
            return {
                txID: 'deploy-tx-id',
                raw_data: {
                    contract: [
                        {
                            parameter: {
                                value: {
                                    owner_address: toHex(account.address),
                                },
                            },
                        },
                    ],
                },
            } as any;
        };

        assert.deepEqual(await walletClient.getAddresses(), [account.address]);
        assert.deepEqual(await walletClient.requestAddresses(), [account.address]);
        assert.deepEqual(await walletClient.signTransaction({ transaction: directTransaction }), {
            ...directTransaction,
            signature: ['0xsignature'],
        });
        assert.equal(await walletClient.signTypedData(testTypedData as any), await account.signTypedData(testTypedData as any));
        assert.deepEqual(await walletClient.sendRawTransaction({ transaction: signedInputTransaction }), {
            txid: signedInputTransaction.txID,
            code: 0,
            message: 'SUCCESS',
            result: true,
            transaction: signedInputTransaction,
        });
        assert.strictEqual(sendRawTransactionCalls[0], signedInputTransaction);

        assert.equal(
            await walletClient.writeContract({
                address: 'TContractAddress',
                abi: testWriteContractAbi,
                functionName: 'transfer',
                args: [account.address, 12],
                value: 3n,
                feeLimit: 1_000,
                tokenId: '1000',
                tokenValue: 2,
                permissionId: 7,
            }),
            'write-tx-id'
        );
        assert.deepEqual(triggerSmartContractArgs, [
            'TContractAddress',
            'transfer(address,uint256)',
            {
                callValue: 3,
                feeLimit: 1_000,
                tokenId: '1000',
                tokenValue: 2,
                permissionId: 7,
                funcABIV2: testWriteContractAbi[0],
                parametersV2: [account.address, 12],
            },
            [],
            account.address,
        ]);
        assert.equal(sendRawTransactionCalls[1].txID, 'write-tx-id');
        assert.deepEqual(sendRawTransactionCalls[1].signature, ['0xsignature']);

        assert.equal(
            await walletClient.deployContract({
                abi: testWriteContractAbi,
                bytecode: '0x6080604052348015600f57600080fd5b50600080fdfe',
                args: [account.address, 12],
                name: 'Test Contract',
                value: 4n,
                feeLimit: 2_000,
                tokenId: '1001',
                tokenValue: 3,
                userFeePercentage: 75,
                originEnergyLimit: 12_345,
                permissionId: 9,
            }),
            'deploy-tx-id'
        );
        assert.deepEqual(createSmartContractArgs, [
            {
                abi: testWriteContractAbi,
                bytecode: '0x6080604052348015600f57600080fd5b50600080fdfe',
                parameters: [account.address, 12],
                name: 'Test Contract',
                callValue: 4,
                feeLimit: 2_000,
                tokenId: '1001',
                tokenValue: 3,
                userFeePercentage: 75,
                originEnergyLimit: 12_345,
                permissionId: 9,
            },
            account.address,
        ]);
        assert.equal(sendRawTransactionCalls[2].txID, 'deploy-tx-id');
        assert.deepEqual(sendRawTransactionCalls[2].signature, ['0xsignature']);

        await assertRejectsWithMessage(
            () =>
                walletClient.writeContract({
                    address: 'TContractAddress',
                    abi: testReadContractAbi,
                    functionName: 'balanceOf',
                    args: [account.address],
                } as any),
            'Function "balanceOf" is read-only.'
        );
        await assertRejectsWithMessage(
            () =>
                walletClient.writeContract({
                    address: 'TContractAddress',
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

    it('validates chain id and block transaction count inputs for new helpers', async function () {
        const publicClient = createPublicClient({ fullHost });
        let blockTransactionCountArg: unknown;

        publicClient._tronWeb.trx.getBlockTransactionCount = async (input) => {
            blockTransactionCountArg = input;
            return 9;
        };

        await assertRejectsWithMessage(() => publicClient.getChainId(), 'getChainId requires a configured chain.');
        assert.equal(await publicClient.getBlockTransactionCount(), 9);
        assert.equal(blockTransactionCountArg, 'latest');
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
        const publicClient = createPublicClient({ fullHost });

        publicClient._tronWeb.trx.getTransactionInfo = async () => ({} as any);

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
        const publicClient = createPublicClient({ fullHost });
        let callArgs: unknown[] | undefined;

        publicClient._tronWeb.transactionBuilder.triggerConstantContract = async (...args: unknown[]) => {
            callArgs = args;
            return {
                result: { result: true },
                transaction: {
                    raw_data: { contract: [] },
                    raw_data_hex: '0xraw',
                    txID: 'tx-id',
                },
                constant_result: ['08c379a0'],
            } as any;
        };
        publicClient._tronWeb.transactionBuilder.estimateEnergy = async () => {
            return {
                result: { result: false },
                energy_required: 0,
            } as any;
        };

        await assertRejectsWithMessage(
            () =>
                publicClient.call({
                    to: 'TContractAddress',
                    account: account.address,
                    value: 5n,
                }),
            'The call has been reverted or has thrown an error.'
        );
        assert.deepEqual(callArgs, ['TContractAddress', '', { callValue: 5 }, [], account.address]);
        await assertRejectsWithMessage(
            () =>
                publicClient.readContract({
                    address: 'TContractAddress',
                    abi: testWriteContractAbi,
                    functionName: 'transfer',
                    args: [account.address, 1],
                } as any),
            'Function "transfer" is not read-only.'
        );
        await assertRejectsWithMessage(
            () =>
                publicClient.estimateContractGas({
                    address: 'TContractAddress',
                    abi: testReadContractAbi,
                    functionName: 'balanceOf',
                    args: [account.address],
                } as any),
            'Function "balanceOf" is read-only.'
        );
        await assertRejectsWithMessage(
            () =>
                publicClient.estimateContractGas({
                    address: 'TContractAddress',
                    abi: testWriteContractAbi,
                    functionName: 'transfer',
                    args: [account.address, 1],
                }),
            'Failed to estimate contract energy.'
        );
    });

    it('covers getLogs and getContractEvents edge cases for event queries', async function () {
        const publicClient = createPublicClient({ fullHost });
        const eventResponse = {
            success: true,
            data: [
                {
                    block_number: 901,
                    block_timestamp: 1_700_000_000_000,
                    caller_contract_address: 'TCallerAddress',
                    contract_address: 'TContractAddress',
                    event_index: 0,
                    event_name: 'Transfer',
                    result: {
                        from: toHex(account.address),
                        to: '410000000000000000000000000000000000000000',
                        value: '12',
                    },
                    result_type: {
                        from: 'address',
                        to: 'address',
                        value: 'uint256',
                    },
                    event: 'Transfer(address,address,uint256)',
                    transaction_id: 'event-tx-id-1',
                    _unconfirmed: false,
                },
            ],
        };

        publicClient._tronWeb.event.getEventsByContractAddress = async () => ({ success: true } as any);
        assert.deepEqual(await publicClient.getLogs({ address: 'TContractAddress' }), { data: [] });

        publicClient._tronWeb.event.getEventsByContractAddress = async () => eventResponse as any;
        await assertRejectsWithMessage(
            () =>
                publicClient.getContractEvents({
                    address: 'TContractAddress',
                    abi: testEventAbi,
                    args: { from: account.address },
                }),
            'getContractEvents requires eventName when filtering args.'
        );
        assert.deepEqual(
            await publicClient.getContractEvents({
                address: 'TContractAddress',
                abi: testEventAbi,
                eventName: 'Transfer',
                args: { from: fromHex('410000000000000000000000000000000000000000') },
            }),
            { data: [] }
        );
    });
});