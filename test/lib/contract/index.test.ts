import { Address } from '../../../src/types/Trx';
import { assert, vi } from 'vitest';
import assertThrow from '../../helpers/assertThrow.js';
import waitChainData from '../../helpers/waitChainData.js';
import wait from '../../helpers/wait.js';
import broadcaster from '../../helpers/broadcaster.js';
import tronWebBuilder from '../../helpers/tronWebBuilder.js';
import { TronWeb } from '../../setup/TronWeb.js';
import contracts from '../../fixtures/contracts';
import { Contract } from '../../../src/lib/contract';

const testCustomError = contracts.testCustomError;
const testSetVal = contracts.testSetVal;

describe('#contract.index', function () {
    let accounts: {
        hex: Address[];
        b58: Address[];
        pks: string[];
    };
    let tronWeb: TronWeb;

    beforeAll(async function () {
        tronWeb = tronWebBuilder.createInstance();
        // ALERT this works only with Tron Quickstart:
        accounts = await tronWebBuilder.getTestAccounts(-1);
    });

    describe('#customError', function () {
        let customError: Contract;

        beforeAll(async function () {
            const tx = await broadcaster(
                tronWeb.transactionBuilder.createSmartContract(
                    {
                        abi: testCustomError.abi,
                        bytecode: testCustomError.bytecode,
                    },
                    accounts.b58[0]
                ),
                accounts.pks[0]
            );
            customError = tronWeb.contract(testCustomError.abi, tx.transaction.contract_address);
        });

        it('should revert with custom error', async () => {
            const txid = await customError.test(111).send();
            let data;
            while (true) {
                data = await tronWeb.trx.getTransactionInfo(txid);
                if (Object.keys(data).length === 0) {
                    await wait(3);
                    continue;
                } else {
                    break;
                }
            }
            const errorData = data.contractResult;
            const expectedErrorData =
                TronWeb.sha3('CustomError(uint256,uint256)', false).slice(0, 8) +
                '000000000000000000000000000000000000000000000000000000000000006f' + // 111
                '0000000000000000000000000000000000000000000000000000000000000001'; // 1
            assert.equal(errorData.join(''), expectedErrorData);
        });
    });

    describe('#at', function () {
        let local: TronWeb;
        let contractHex: string;
        let contractB58: string;
        let otherHex: string;

        beforeAll(async function () {
            local = tronWebBuilder.createInstance();
            const tx = await broadcaster(
                local.transactionBuilder.createSmartContract(
                    { abi: testSetVal.abi, bytecode: testSetVal.bytecode },
                    accounts.b58[1]
                ),
                accounts.pks[1]
            );
            assert.isTrue(tx.receipt.result, `deploy failed: ${JSON.stringify(tx.receipt)}`);
            contractHex = tx.transaction.contract_address.toLowerCase();
            contractB58 = TronWeb.address.fromHex(contractHex);
            await waitChainData('contract', contractHex);
            const other = await broadcaster(
                local.transactionBuilder.createSmartContract(
                    { abi: testSetVal.abi, bytecode: testSetVal.bytecode },
                    accounts.b58[1]
                ),
                accounts.pks[1]
            );
            assert.isTrue(other.receipt.result, `deploy failed: ${JSON.stringify(other.receipt)}`);
            otherHex = other.transaction.contract_address.toLowerCase();
            await waitChainData('contract', otherHex);
        });

        afterEach(function () {
            vi.restoreAllMocks();
        });

        it('should load the contract at the requested address given in hex', async function () {
            const contract = await local.contract().at(contractHex);
            assert.equal(contract.address, contractHex);
            assert.isTrue(contract.deployed);
            assert.isFunction(contract.set);
        });

        it('should load the contract at the requested address given in base58', async function () {
            const contract = await local.contract().at(contractB58);
            assert.equal(contract.address, contractHex);
            assert.isFunction(contract.set);
        });

        it('should load the contract at the requested address given in upper-case hex', async function () {
            const contract = await local.contract().at(contractHex.toUpperCase());
            assert.equal(contract.address, contractHex);
        });

        it('should accept the answer the node actually gives', async function () {
            const genuine = await local.trx.getContract(contractHex);
            vi.spyOn(local.trx, 'getContract').mockResolvedValue({ ...genuine });
            const contract = await local.contract().at(contractB58);
            assert.equal(contract.address, contractHex);
            assert.isFunction(contract.set);
        });

        it('should accept the answer when the node returns the address in base58', async function () {
            const genuine = await local.trx.getContract(contractHex);
            vi.spyOn(local.trx, 'getContract').mockResolvedValue({ ...genuine, contract_address: contractB58 });
            const contract = await local.contract().at(contractHex);
            assert.equal(contract.address, contractHex);
        });

        it('should reject an answer that describes another contract', async function () {
            const genuine = await local.trx.getContract(contractHex);
            vi.spyOn(local.trx, 'getContract').mockResolvedValue({ ...genuine, contract_address: otherHex });
            const contract = local.contract();
            await assertThrow(contract.at(contractHex), undefined, 'Invalid contract address provided');
            assert.isFalse(contract.address);
            assert.isFalse(contract.deployed);
            assert.isUndefined((contract as any).set);
        });

        it('should reject an answer that describes another contract given in base58', async function () {
            const genuine = await local.trx.getContract(contractHex);
            vi.spyOn(local.trx, 'getContract').mockResolvedValue({
                ...genuine,
                contract_address: TronWeb.address.fromHex(otherHex),
            });
            await assertThrow(local.contract().at(contractB58), undefined, 'Invalid contract address provided');
        });

        it('should keep rejecting an invalid address', async function () {
            await assertThrow(local.contract().at('notAnAddress'), undefined, 'Invalid contract address provided');
        });

        it('should keep reporting a contract that has not been deployed', async function () {
            vi.spyOn(local.trx, 'getContract').mockRejectedValue(new Error('Contract does not exist'));
            await assertThrow(local.contract().at(contractHex), 'Contract has not been deployed on the network');
        });
    });
});
