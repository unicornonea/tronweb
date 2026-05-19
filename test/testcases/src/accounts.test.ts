import { assert } from 'chai';

import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js';
import { toHex } from '../../../src/utils/address.js';
import { hexStr2byteArray } from '../../../src/utils/code.js';
import { ADDRESS_PREFIX } from '../../../src/utils/constants.js';
import { ecRecover, getBase58CheckAddress } from '../../../src/utils/crypto.js';
import { verifyMessage } from '../../../src/utils/message.js';
import { txJsonToPb, txPbToRawDataHex, txPbToTxID } from '../../../src/utils/transaction.js';
import { verifyTypedData } from '../../../src/utils/typedData.js';

describe('privateKeyToAccount', function () {
    const privateKey = `0x${'1'.padStart(64, '0')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const expectedAddress = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC';
    const expectedPublicKey =
        '0x0479BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8';
    const expectedHashSignature =
        '0xe7c93726a865578504442b1a6827f676e0ed74bdff2be3960d1e253bbcfc44626aa772b878bc912bdbb33a0014ec507c4b3896ea85aa914b74dee9b7ac3e56da1c';
    const expectedMessageSignature =
        '0x0dc0b53d525e0103a6013061cf18e60cf158809149f2b8994a545af65a7004cb1eeaff560e801ab51b28df5d42549aa024c2aa7e9d34de1e01294b9afb5e6c7e1c';
    const expectedTypedDataSignature =
        '0x538f90916cfd0fcacc0f416e4bf019bfbca22085ada2168e83e6107e2453ea6b2469ba68c2b53c6fab691b0e4e47b895b831593cc9c7b26c43a2656fb57a36481c';

    const typedDataDomain = {
        name: 'TrcToken Test',
        version: '1',
        chainId: '0xd698d4192c56cb6be724a558448e2684802de4d6cd8690dc',
        verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
    };

    const typedDataTypes = {
        FromPerson: [
            { name: 'name', type: 'string' },
            { name: 'wallet', type: 'address' },
            { name: 'trcTokenId', type: 'trcToken' },
        ],
        ToPerson: [
            { name: 'name', type: 'string' },
            { name: 'wallet', type: 'address' },
            { name: 'trcTokenArr', type: 'trcToken[]' },
        ],
        Mail: [
            { name: 'from', type: 'FromPerson' },
            { name: 'to', type: 'ToPerson' },
            { name: 'contents', type: 'string' },
            { name: 'tAddr', type: 'address[]' },
            { name: 'trcTokenId', type: 'trcToken' },
            { name: 'trcTokenArr', type: 'trcToken[]' },
        ],
    };

    const typedDataMessage = {
        from: {
            name: 'Cow',
            wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
            trcTokenId: '1002000',
        },
        to: {
            name: 'Bob',
            wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
            trcTokenArr: ['1002000', '1002000'],
        },
        contents: 'Hello, Bob!',
        tAddr: ['0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB', '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'],
        trcTokenId: '1002000',
        trcTokenArr: ['1002000', '1002000'],
    };

    function recoveredTypedDataAddress(signature: `0x${string}`): string {
        const hexAddress = verifyTypedData(typedDataDomain, typedDataTypes as any, typedDataMessage, signature);
        return getBase58CheckAddress(hexStr2byteArray(`${ADDRESS_PREFIX}${hexAddress.replace(/^0x/, '')}`));
    }

    function createTransferTransaction(ownerAddress = toHex(account.address)) {
        const transaction = {
            visible: false,
            txID: '',
            raw_data: {
                contract: [
                    {
                        type: 'TransferContract',
                        parameter: {
                            value: {
                                owner_address: ownerAddress,
                                to_address: `41${'2'.repeat(40)}`,
                                amount: 1,
                            },
                            type_url: 'type.googleapis.com/protocol.TransferContract',
                        },
                    },
                ],
                ref_block_bytes: '0000',
                ref_block_hash: '0000000000000000',
                expiration: 1,
                timestamp: 1,
            },
            raw_data_hex: '',
        } as any;
        const transactionPb = txJsonToPb(transaction);

        transaction.txID = txPbToTxID(transactionPb).replace(/^0x/, '');
        transaction.raw_data_hex = txPbToRawDataHex(transactionPb);

        return transaction;
    }

    async function assertRejectsWithMessage(action: () => Promise<unknown>, message: string) {
        try {
            await action();
            assert.fail(`Expected rejection with message: ${message}`);
        } catch (error) {
            assert.instanceOf(error, Error);
            assert.equal((error as Error).message, message);
        }
    }

    it('returns a plain viem-style local account object without leaking the private key', function () {
        assert.equal(account.address, expectedAddress);
        assert.equal(account.publicKey, expectedPublicKey);
        assert.equal(account.type, 'local');
        assert.equal(account.source, 'privateKey');
        assert.strictEqual(Object.getPrototypeOf(account), Object.prototype);
        assert.isTrue(account.publicKey.startsWith('0x04'));
        assert.isFunction(account.sign);
        assert.isFunction(account.signMessage);
        assert.isFunction(account.signTransaction);
        assert.isFunction(account.signTypedData);
        assert.deepEqual(Object.keys(account), [
            'address',
            'publicKey',
            'type',
            'source',
            'sign',
            'signMessage',
            'signTransaction',
            'signTypedData',
        ]);
        assert.isUndefined((account as any).nonceManager);
        assert.isUndefined((account as any).signAuthorization);
        assert.isUndefined((account as any).recoverMessageSigner);
        assert.isUndefined((account as any).recoverTypedDataSigner);
        assert.isUndefined((account as any).recoverTransactionSigners);
        assert.isUndefined((account as any).privateKey);
    });

    it('requires a 0x-prefixed 32-byte private key', function () {
        assert.throws(
            () => privateKeyToAccount('1'.padStart(64, '0') as any),
            'Invalid private key: must be a 0x-prefixed 32-byte hex string'
        );
        assert.throws(
            () => privateKeyToAccount('0x1' as any),
            'Invalid private key: must be a 0x-prefixed 32-byte hex string'
        );
    });

    it('supports sign({ hash }) and viem-style signMessage parameters', async function () {
        const hash = `0x${'11'.repeat(32)}` as `0x${string}`;
        const signaturePromise = account.sign({ hash });
        const signature = await signaturePromise;
        const recoveredHex = ecRecover(hash, signature);
        const recoveredAddress = getBase58CheckAddress(hexStr2byteArray(recoveredHex));
        const rawHex = '0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad' as `0x${string}`;
        const rawBytes = new Uint8Array(hexStr2byteArray(rawHex.replace(/^0x/, ''), true));
        const textSignaturePromise = account.signMessage({ message: 'hello world' });
        const rawHexSignaturePromise = account.signMessage({ message: { raw: rawHex } });
        const rawBytesSignaturePromise = account.signMessage({ message: { raw: rawBytes } });
        const textSignature = await textSignaturePromise;
        const rawHexSignature = await rawHexSignaturePromise;
        const rawBytesSignature = await rawBytesSignaturePromise;

        assert.isTrue(signature.startsWith('0x'));
        assert.instanceOf(signaturePromise, Promise);
        assert.equal(signature, expectedHashSignature);
        assert.instanceOf(textSignaturePromise, Promise);
        assert.equal(textSignature, expectedMessageSignature);
        assert.equal(recoveredAddress, account.address);
        assert.equal(verifyMessage('hello world', textSignature), account.address);
        assert.equal(rawHexSignature, rawBytesSignature);
    });

    it('supports viem-style signTypedData parameters', async function () {
        const signaturePromise = account.signTypedData({
            domain: typedDataDomain,
            types: typedDataTypes,
            primaryType: 'Mail',
            message: typedDataMessage,
        });
        const signature = await signaturePromise;

        assert.instanceOf(signaturePromise, Promise);
        assert.equal(signature, expectedTypedDataSignature);
        assert.equal(recoveredTypedDataAddress(signature), account.address);
    });

    it('recovers transaction signers as base58Check addresses', async function () {
        const transaction = createTransferTransaction();
        const signedPromise = account.signTransaction(transaction);
        const signed = await signedPromise;

        const signers = (signed.signature ?? []).map((signature) =>
            getBase58CheckAddress(hexStr2byteArray(ecRecover(signed.txID, signature)))
        );

        assert.instanceOf(signedPromise, Promise);
        assert.equal(signed.txID, transaction.txID);
        assert.lengthOf(signed.signature ?? [], 1);
        assert.lengthOf(signed.signature[0], 130);
        assert.deepEqual(signers, [account.address]);
        assert.match(signers[0], /^T/);
    });

    it('rejects transactions that are already signed', async function () {
        const transaction = {
            ...createTransferTransaction(),
            signature: ['0'.repeat(130)],
        } as any;

        await assertRejectsWithMessage(
            () => account.signTransaction(transaction),
            'Transaction is already signed'
        );
    });

    it('rejects transactions owned by another address', async function () {
        const transaction = createTransferTransaction(`41${'3'.repeat(40)}`);

        await assertRejectsWithMessage(
            () => account.signTransaction(transaction),
            'Private key does not match address in transaction'
        );
    });

    it('rejects invalid transactions', async function () {
        const transaction = createTransferTransaction();
        transaction.raw_data_hex += '00';

        await assertRejectsWithMessage(() => account.signTransaction(transaction), 'Invalid transaction');
    });

    it('rejects invalid sign hash input', async function () {
        try {
            await account.sign({ hash: '0x1' as any });
            assert.fail('Expected sign({ hash }) to reject invalid hash input');
        } catch (error) {
            assert.instanceOf(error, Error);
            assert.equal((error as Error).message, 'Invalid hash: must be a 0x-prefixed 32-byte hex string');
        }
    });
});