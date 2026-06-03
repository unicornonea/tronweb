import type {
    Hex,
    PrivateKeyAccount,
    SignableMessage,
    SignMessageParameters,
    SignTypedDataParameters,
} from './types.js';
import type { SignedTransaction, Transaction } from '../types/Transaction.js';
import type { ContractParamter } from '../types/Contract.js';
import {
    getPubKeyFromPriKey,
    getAddressFromPriKey,
    signTransaction as cryptoSignTransaction,
} from '../utils/crypto.js';
import { getBase58CheckAddress } from '../utils/crypto.js';
import { toHex } from '../utils/address.js';
import { signMessage as cryptoSignMessage } from '../utils/message.js';
import { signTypedData as cryptoSignTypedData } from '../utils/typedData.js';
import { txCheck } from '../utils/transaction.js';
import { hexStr2byteArray, byteArray2hexStr } from '../utils/code.js';
import { hexToBytes } from '../utils/bytes.js';

function normalizePrivateKey(privateKey: string): Hex {
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
        throw new Error('Invalid private key: must be a 0x-prefixed 32-byte hex string');
    }
    return privateKey as Hex;
}

function normalizeRawMessage(raw: Hex | Uint8Array): Uint8Array {
    if (raw instanceof Uint8Array) return raw;

    if (!/^0x[0-9a-fA-F]+$/.test(raw)) {
        throw new Error('Invalid raw message: must be a 0x-prefixed hex string or Uint8Array');
    }

    // raw.length includes the even-length '0x' prefix, so its parity matches the hex digit count.
    if (raw.length % 2 !== 0) {
        throw new Error('Invalid raw message: hex string must have an even number of digits');
    }

    return hexToBytes(raw.slice(2));
}

function resolveMessageInput(message: SignableMessage): string | Uint8Array {
    if (typeof message === 'string') return message;
    return normalizeRawMessage(message.raw);
}

function isTransactionShapeValid(transaction: Transaction): boolean {
    try {
        return txCheck(transaction);
    } catch {
        return false;
    }
}

function assertSignableTx(transaction: Transaction, addressHex: string): void {
    if (!transaction || typeof transaction !== 'object') {
        throw new Error('Invalid transaction provided');
    }

    if (Array.isArray((transaction as SignedTransaction).signature) && (transaction as SignedTransaction).signature.length > 0) {
        throw new Error('Transaction is already signed');
    }

    if (!isTransactionShapeValid(transaction)) {
        throw new Error('Invalid transaction');
    }

    const ownerAddress = (transaction.raw_data.contract[0]?.parameter?.value as { owner_address?: string } | undefined)?.owner_address;

    if (!ownerAddress || toHex(ownerAddress) !== addressHex) {
        throw new Error('Private key does not match address in transaction');
    }
}

/**
 * Create an Account object from a hex private key.
 * The private key is encapsulated — it is never directly accessible on the returned object.
 *
 * @example
 * ```ts
 * const account = privateKeyToAccount('0xyour-private-key-hex');
 * console.log(account.address);  // TXyz...
 * console.log(account.publicKey); // 0x04...
 * ```
 */
export function privateKeyToAccount(privateKey: Hex): PrivateKeyAccount {
    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    const privateKeyBytes = hexStr2byteArray(normalizedPrivateKey.slice(2));
    const publicKey = `0x${byteArray2hexStr(getPubKeyFromPriKey(privateKeyBytes))}` as Hex;
    const address = getBase58CheckAddress(getAddressFromPriKey(privateKeyBytes));
    const addressHex = toHex(address);

    return {
        address,
        publicKey,
        type: 'local',
        source: 'privateKey',
        async signMessage({ message }: SignMessageParameters): Promise<Hex> {
            return cryptoSignMessage(resolveMessageInput(message), normalizedPrivateKey) as Hex;
        },
        async signTransaction<T extends ContractParamter>(transaction: Transaction<T>): Promise<SignedTransaction<T>> {
            assertSignableTx(transaction, addressHex);
            return cryptoSignTransaction(normalizedPrivateKey.slice(2), transaction) as SignedTransaction<T>;
        },
        async signTypedData({ domain = {}, types, message }: SignTypedDataParameters): Promise<Hex> {
            return cryptoSignTypedData(domain, types as any, message, normalizedPrivateKey) as Hex;
        },
    };
}
