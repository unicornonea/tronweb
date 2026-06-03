import { assert } from 'chai';

import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js';
import { createContract, getContract } from '../../../src/clients/getContract.js';
import { createPublicClient } from '../../../src/clients/createPublicClient.js';
import { createWalletClient } from '../../../src/clients/createWalletClient.js';

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
});