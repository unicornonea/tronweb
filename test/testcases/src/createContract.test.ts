import { assert } from 'chai';

import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js';
import { createContract, getContract } from '../../../src/clients/getContract.js';
import { createPublicClient } from '../../../src/clients/createPublicClient.js';
import { createWalletClient } from '../../../src/clients/createWalletClient.js';
import { HttpProvider } from '../../../src/lib/providers/index.js';
import { toHex } from '../../../src/utils/address.js';
import * as tbActions from '../../../src/lib/actions/transactionBuilder.js';
import * as trxActions from '../../../src/lib/actions/trx.js';
import tronWebBuilder from '../../helpers/tronWebBuilder.js';
import wait from '../../helpers/wait.js';
import config from '../../helpers/config.js';
import Contracts from '../../fixtures/contracts.js';

const { FULL_NODE_API } = config;

describe('getContract', function () {
    const fullHost = 'http://127.0.0.1';
    const privateKey = `0x${'1'.padStart(64, '0')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const contractAddress = 'TVpR93hVUGKVVFhVRC7DseKJQDeKQpWJq3';
    const contractAbi = [
        {
            type: 'function',
            name: 'balanceOf',
            stateMutability: 'view',
            inputs: [{ name: 'owner', type: 'address' }],
            outputs: [{ name: 'balance', type: 'uint256' }],
        },
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
    const reservedAbi = [
        {
            type: 'function',
            name: 'constructor',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ name: 'label', type: 'string' }],
        },
        {
            type: 'function',
            name: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'owner', type: 'address' }],
            outputs: [{ name: 'owner', type: 'address' }],
        },
        {
            type: 'function',
            name: 'read',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ name: 'count', type: 'uint256' }],
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

    it('keeps createContract as a compatibility alias', function () {
        assert.strictEqual(createContract, getContract);
    });

    it('rejects contract calls with the wrong number of arguments', function () {
        const publicClient = createPublicClient({ fullHost });
        const contract = getContract({ client: publicClient, abi: contractAbi, address: contractAddress });

        // balanceOf takes exactly one argument
        assert.throws(
            () => (contract as any).balanceOf(account.address, account.address),
            'Contract function "balanceOf" expects 1 argument(s) but received 2.'
        );
        assert.throws(
            () => (contract as any).balanceOf(),
            'Contract function "balanceOf" expects 1 argument(s) but received 0.'
        );
        assert.throws(
            () => (contract as any).read.balanceOf([account.address, account.address]),
            'Contract function "balanceOf" expects 1 argument(s) but received 2.'
        );
    });

    it('adds metadata and contract namespaces for public clients', async function () {
        const publicClient = createPublicClient({ fullHost });
        const eventResponse = {
            data: [
                {
                    block_number: 123,
                    block_timestamp: 1_700_000_000_000,
                    caller_contract_address: account.address,
                    contract_address: contractAddress,
                    event_index: 0,
                    event_name: 'Transfer',
                    result: {
                        from: account.address,
                        to: contractAddress,
                        value: '5',
                    },
                    result_type: {
                        from: 'address',
                        to: 'address',
                        value: 'uint256',
                    },
                    event: 'Transfer(address,address,uint256)',
                    transaction_id: 'tx-id',
                    _unconfirmed: false,
                },
            ],
            meta: {
                at: 1_700_000_000_100,
                page_size: 1,
            },
        };
        let readInput: unknown;
        let estimateGasInput: unknown;
        let getEventsInput: unknown;

        (publicClient as any).readContract = async (input: unknown) => {
            readInput = input;
            return 42n;
        };
        (publicClient as any).estimateContractGas = async (input: unknown) => {
            estimateGasInput = input;
            return 21_000n;
        };
        (publicClient as any).getContractEvents = async (input: unknown) => {
            getEventsInput = input;
            return eventResponse;
        };

        const contract = getContract({ client: publicClient, abi: contractAbi, address: contractAddress });

        assert.equal(contract.address, contractAddress);
        assert.strictEqual(contract.abi, contractAbi);
        assert.isFunction((contract as any).balanceOf);
        assert.isFunction((contract as any).transfer);
        assert.isFunction((contract as any).read.balanceOf);
        assert.isFunction((contract as any).estimateGas.transfer);
        assert.isFunction((contract as any).getEvents.Transfer);
        assert.isUndefined((contract as any).write);

        assert.equal(await (contract as any).balanceOf(account.address), 42n);
        assert.deepEqual(readInput, {
            address: contractAddress,
            abi: contractAbi,
            functionName: 'balanceOf',
            args: [account.address],
        });

        assert.equal(
            await (contract as any).read.balanceOf([account.address], {
                account: account.address,
                value: 3n,
            }),
            42n
        );
        assert.deepEqual(readInput, {
            address: contractAddress,
            abi: contractAbi,
            functionName: 'balanceOf',
            args: [account.address],
            account: account.address,
            value: 3n,
        });

        assert.equal(
            await (contract as any).estimateGas.transfer([account.address, 5n], {
                account: account.address,
                value: 9n,
            }),
            21_000n
        );
        assert.deepEqual(estimateGasInput, {
            address: contractAddress,
            abi: contractAbi,
            functionName: 'transfer',
            args: [account.address, 5n],
            account: account.address,
            value: 9n,
        });

        assert.strictEqual(
            await (contract as any).getEvents.Transfer({ from: account.address }, { onlyConfirmed: true, limit: 2 }),
            eventResponse
        );
        assert.deepEqual(getEventsInput, {
            address: contractAddress,
            abi: contractAbi,
            eventName: 'Transfer',
            args: { from: account.address },
            onlyConfirmed: true,
            limit: 2,
        });

        await (contract as any).getEvents.Transfer({ onlyConfirmed: true, limit: 1 });
        assert.deepEqual(getEventsInput, {
            address: contractAddress,
            abi: contractAbi,
            eventName: 'Transfer',
            onlyConfirmed: true,
            limit: 1,
        });

        await (contract as any).getEvents.Transfer([account.address, contractAddress, 5n], { onlyUnconfirmed: true });
        assert.deepEqual(getEventsInput, {
            address: contractAddress,
            abi: contractAbi,
            eventName: 'Transfer',
            args: {
                from: account.address,
                to: contractAddress,
                value: 5n,
            },
            onlyUnconfirmed: true,
        });

        await assertRejectsWithMessage(
            () => (contract as any).transfer(account.address, 1n),
            'Method "transfer" modifies state and requires a WalletClient. Use createWalletClient() instead of createPublicClient().'
        );
    });

    it('routes write calls and object-style options through the wallet namespace', async function () {
        const walletClient = createWalletClient({ fullHost, account });
        let writeInput: unknown;

        (walletClient as any).writeContract = async (input: unknown) => {
            writeInput = input;
            return 'write-tx-id';
        };

        const contract = getContract({ client: walletClient, abi: contractAbi, address: contractAddress });

        assert.isFunction((contract as any).transfer);
        assert.isFunction((contract as any).write.transfer);

        assert.equal(await (contract as any).transfer(account.address, 7n), 'write-tx-id');
        assert.deepEqual(writeInput, {
            address: contractAddress,
            abi: contractAbi,
            functionName: 'transfer',
            args: [account.address, 7n],
        });

        assert.equal(
            await (contract as any).write.transfer([account.address, 9n], {
                account: account.address,
                value: 11n,
                feeLimit: 2_000_000,
                tokenId: '1002000',
                tokenValue: 3,
                permissionId: 4,
            }),
            'write-tx-id'
        );
        assert.deepEqual(writeInput, {
            address: contractAddress,
            abi: contractAbi,
            functionName: 'transfer',
            args: [account.address, 9n],
            account: account.address,
            value: 11n,
            feeLimit: 2_000_000,
            tokenId: '1002000',
            tokenValue: 3,
            permissionId: 4,
        });
    });

    it('keeps reserved and namespace-colliding ABI names callable', async function () {
        const publicClient = createPublicClient({ fullHost });

        (publicClient as any).readContract = async (input: any) => {
            if (input.functionName === 'function') {
                return input.args[0];
            }

            return input.functionName;
        };

        const contract = getContract({ client: publicClient, abi: reservedAbi, address: contractAddress });

        assert.equal(await (contract as any).constructor(), 'constructor');
        assert.equal(await (contract as any).function(account.address), account.address);
        assert.isObject((contract as any).read);
        assert.isFunction((contract as any).read.read);
        assert.equal(await (contract as any).read.read(), 'read');
    });

    describe('against a contract deployed to the fullNode', function () {
        this.timeout(180000);

        // funcABIV2_3 exposes setStruct((address,address,address)) (a struct/tuple
        // parameter write), get1()/s(uint256) (tuple reads), so one deploy covers
        // read, write, estimate and argument-validation against a real contract.
        const fixture = Contracts.funcABIV2_3;
        let deployer: ReturnType<typeof privateKeyToAccount>;
        let publicClient: ReturnType<typeof createPublicClient>;
        let walletClient: ReturnType<typeof createWalletClient>;
        let deployedAddress: string;
        let struct: [string, string, string];

        async function waitForReceipt(txId: string): Promise<any> {
            for (let i = 0; i < 20; i++) {
                const info: any = await publicClient.getTransactionInfo({ txId }).catch(() => ({}));
                if (info && Object.keys(info).length) return info;
                await wait(3);
            }
            throw new Error(`transaction not confirmed on chain: ${txId}`);
        }

        const addrBody = (a: string) =>
            (/^(0x)?(41)?[0-9a-f]{40}$/i.test(a) ? a : toHex(a)).toLowerCase().replace(/^0x/, '').replace(/^41/, '');

        before(async function () {
            this.timeout(180000);

            const accounts = await tronWebBuilder.getTestAccounts(-1);
            const idx = accounts.pks.findIndex((p) => /^(0x)?[0-9a-fA-F]{64}$/.test(p));
            const pk = accounts.pks[idx].replace(/^0x/, '');
            const ownerHex = accounts.hex[idx];
            deployer = privateKeyToAccount(`0x${pk}` as `0x${string}`);
            struct = [accounts.b58[1], accounts.b58[2], accounts.b58[3]];

            const fullNode = new HttpProvider(FULL_NODE_API);
            publicClient = createPublicClient({ fullHost: FULL_NODE_API });
            walletClient = createWalletClient({ account: deployer, fullHost: FULL_NODE_API });

            const deployTx = await tbActions.createSmartContract(
                fullNode,
                { abi: fixture.abi, bytecode: fixture.bytecode, feeLimit: 1_000_000_000 },
                ownerHex
            );
            const signedDeploy = await deployer.signTransaction(deployTx);
            await trxActions.sendRawTransaction(fullNode, signedDeploy);
            await waitForReceipt(deployTx.txID);
            deployedAddress = deployTx.contract_address;
        });

        it('exposes read/estimate namespaces and refuses writes on a public client', async function () {
            const contract = getContract({ client: publicClient, abi: fixture.abi as any, address: deployedAddress });

            assert.equal(contract.address, deployedAddress);
            assert.strictEqual(contract.abi, fixture.abi);
            assert.isFunction((contract as any).get1);
            assert.isFunction((contract as any).setStruct);
            assert.isFunction((contract as any).read.get1);
            assert.isFunction((contract as any).estimateGas.setStruct);
            assert.isUndefined((contract as any).write);

            // setStruct modifies state, so it must reject on a public client
            await assertRejectsWithMessage(
                () => (contract as any).setStruct(struct),
                'Method "setStruct" modifies state and requires a WalletClient. Use createWalletClient() instead of createPublicClient().'
            );
        });

        it('writes a tuple via setStruct and reads it back via get1', async function () {
            const writeContract = getContract({ client: walletClient, abi: fixture.abi as any, address: deployedAddress });
            const readContract = getContract({ client: publicClient, abi: fixture.abi as any, address: deployedAddress });

            // write namespace form: args array + object-style options
            const writeTxId = await (writeContract as any).write.setStruct([struct], { feeLimit: 1_000_000_000 });
            assert.isString(writeTxId);
            const receipt = await waitForReceipt(writeTxId);
            assert.notEqual(receipt.result, 'FAILED', 'setStruct reverted on chain');

            // the tuple must round-trip through the real contract storage
            const raw: any = await (readContract as any).get1();
            const tuple = Array.isArray(raw[0]) ? raw[0] : raw;
            assert.equal(addrBody(tuple[0]), addrBody(struct[0]));
            assert.equal(addrBody(tuple[1]), addrBody(struct[1]));
            assert.equal(addrBody(tuple[2]), addrBody(struct[2]));
        });

        it('estimates energy for a contract call', async function () {
            const contract = getContract({ client: publicClient, abi: fixture.abi as any, address: deployedAddress });

            const energy = await (contract as any).estimateGas.setStruct([struct], { account: deployer.address });
            assert.typeOf(energy, 'bigint');
            assert.isAbove(Number(energy), 0);
        });

        it('rejects calls with the wrong number of arguments', function () {
            const contract = getContract({ client: publicClient, abi: fixture.abi as any, address: deployedAddress });

            // s(uint256) takes exactly one argument
            assert.throws(
                () => (contract as any).s(1, 2),
                'Contract function "s" expects 1 argument(s) but received 2.'
            );
            assert.throws(
                () => (contract as any).s(),
                'Contract function "s" expects 1 argument(s) but received 0.'
            );
            assert.throws(
                () => (contract as any).read.s([1, 2]),
                'Contract function "s" expects 1 argument(s) but received 2.'
            );
        });
    });
});
