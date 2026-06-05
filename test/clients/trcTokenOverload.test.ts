import { assert } from 'chai';

import { privateKeyToAccount } from '../../src/clients/accounts/privateKeyToAccount.js';
import { createPublicClient } from '../../src/clients/createPublicClient.js';
import { createWalletClient } from '../../src/clients/createWalletClient.js';
import { getContract } from '../../src/clients/getContract.js';
import { HttpProvider } from '../../src/lib/providers/index.js';
import * as tbActions from '../../src/lib/actions/transactionBuilder.js';
import * as trxActions from '../../src/lib/actions/trx.js';
import tronWebBuilder from '../helpers/tronWebBuilder.js';
import wait from '../helpers/wait.js';
import config from '../helpers/config.js';
import { trcTokenOverloadAbi, trcTokenOverloadBytecode } from '../fixtures/trcTokenOverload.js';

const { FULL_NODE_API } = config;
const ABI = trcTokenOverloadAbi;
const BYTECODE = trcTokenOverloadBytecode;

describe('getContract — trcToken + overloaded functions on a deployed contract', function () {
    this.timeout(180000);

    let deployer: ReturnType<typeof privateKeyToAccount>;
    let publicClient: ReturnType<typeof createPublicClient>;
    let walletClient: ReturnType<typeof createWalletClient>;
    let deployedAddress: string;

    async function waitForReceipt(txId: string): Promise<any> {
        for (let i = 0; i < 20; i++) {
            const info: any = await publicClient.getTransactionInfo({ txId }).catch(() => ({}));
            if (info && Object.keys(info).length) return info;
            await wait(3);
        }
        throw new Error(`transaction not confirmed on chain: ${txId}`);
    }

    before(async function () {
        this.timeout(180000);

        const accounts = await tronWebBuilder.getTestAccounts(-1);
        const idx = accounts.pks.findIndex((p) => /^(0x)?[0-9a-fA-F]{64}$/.test(p));
        const pk = accounts.pks[idx].replace(/^0x/, '');
        const ownerHex = accounts.hex[idx];
        deployer = privateKeyToAccount(`0x${pk}` as `0x${string}`);
        publicClient = createPublicClient({ fullHost: FULL_NODE_API });
        walletClient = createWalletClient({ account: deployer, fullHost: FULL_NODE_API });

        const fullNode = new HttpProvider(FULL_NODE_API);
        const deployTx = await tbActions.createSmartContract(
            fullNode,
            { abi: ABI as any, bytecode: BYTECODE, feeLimit: 1_000_000_000 },
            ownerHex
        );
        const signedDeploy = await deployer.signTransaction(deployTx);
        await trxActions.sendRawTransaction(fullNode, signedDeploy);
        await waitForReceipt(deployTx.txID);
        deployedAddress = deployTx.contract_address;
    });

    it('resolves the store(uint256) vs store(uint256,uint256) overload by arity on-chain', async function () {
        const wc = getContract({ client: walletClient, abi: ABI as any, address: deployedAddress }) as any;
        const rc = getContract({ client: publicClient, abi: ABI as any, address: deployedAddress }) as any;

        // 1-arg overload sets stored = a
        const r1 = await waitForReceipt(await wc.write.store([5], { feeLimit: 1_000_000_000 }));
        assert.notEqual(r1.result, 'FAILED', 'store(uint256) reverted');
        assert.equal(String(await rc.read.getStored()), '5');

        // 2-arg overload (previously unreachable) sets stored = a + b = 12
        const r2 = await waitForReceipt(await wc.write.store([5, 7], { feeLimit: 1_000_000_000 }));
        assert.notEqual(r2.result, 'FAILED', 'store(uint256,uint256) reverted');
        assert.equal(String(await rc.read.getStored()), '12');
    });

    it('encodes a trcToken parameter with the trcToken-form selector on-chain', async function () {
        const wc = getContract({ client: walletClient, abi: ABI as any, address: deployedAddress }) as any;
        const rc = getContract({ client: publicClient, abi: ABI as any, address: deployedAddress }) as any;

        const tokenId = 1_000_001;
        const amount = 4242;
        // recordToken's selector must be keccak("recordToken(address,trcToken,uint256)").
        // If it used the uint256 form, this call would miss the on-chain function (revert)
        // and the reads below would stay 0.
        const receipt = await waitForReceipt(
            await wc.write.recordToken([deployer.address, tokenId, amount], { feeLimit: 1_000_000_000 })
        );
        assert.notEqual(receipt.result, 'FAILED', 'recordToken reverted — wrong selector?');

        assert.equal(String(await rc.read.getAmount()), String(amount));
        assert.equal(String(await rc.read.getToken()), String(tokenId));
    });
});
