import type { SignedTransaction, Transaction } from '../types/Transaction.js';
import type { TypedDataDomain, TypedDataField } from '../utils/typedData.js';

export type Hex = `0x${string}`;
export type ByteArray = Uint8Array;
export type AccountType = 'local';
export type AccountSource = 'privateKey';
export type SignableMessage =
    | string
    | {
          readonly raw: Hex | ByteArray;
      };

export interface SignHashParameters {
    readonly hash: Hex;
}

export interface SignMessageParameters {
    readonly message: SignableMessage;
}

export interface SignTypedDataParameters {
    readonly domain?: TypedDataDomain;
    readonly types: Record<string, TypedDataField[]>;
    readonly primaryType: string;
    readonly message: Record<string, unknown>;
}

/**
 * A TronWeb Account object created from a private key.
 * The private key is encapsulated and never exposed directly.
 */
export interface Account {
    /** base58Check format address, e.g. TXyz... */
    readonly address: string;
    /** Uncompressed public key, hex string (0x04...) */
    readonly publicKey: Hex;
    /** Local account type marker */
    readonly type: AccountType;
    /** Account source marker */
    readonly source: AccountSource;

    /**
     * Sign a 32-byte hash directly.
     * @param params.hash - 32-byte hex hash
     * @returns hex signature string (0x-prefixed)
     */
    sign(params: SignHashParameters): Hex;

    /**
     * Sign a message using TRON message header.
     * @param params.message - string message or raw bytes wrapper
     * @returns hex signature string (0x-prefixed)
     */
    signMessage(params: SignMessageParameters): Hex;

    /**
     * Sign a TRON transaction.
     * @param transaction - unsigned Transaction object
     * @returns SignedTransaction with signature array populated
     */
    signTransaction(transaction: Transaction): SignedTransaction;

    /**
     * Sign EIP-712 typed data.
     * @returns hex signature string (0x-prefixed)
     */
    signTypedData(params: SignTypedDataParameters): Hex;
}

/**
 * A private key account with async message and typed-data signing.
 */
export type PrivateKeyAccount = Omit<Account, 'sign' | 'signMessage' | 'signTransaction' | 'signTypedData'> & {
    sign(params: SignHashParameters): Promise<Hex>;
    signMessage(params: SignMessageParameters): Promise<Hex>;
    signTransaction(transaction: Transaction): Promise<SignedTransaction>;
    signTypedData(params: SignTypedDataParameters): Promise<Hex>;
};

export type WalletAccount = Account | PrivateKeyAccount;
