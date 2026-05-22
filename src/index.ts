import utils from './utils/index.js';
export { utils };

import { BigNumber } from 'bignumber.js';
export { BigNumber };

import { providers } from './lib/providers/index.js';
export { providers };

import { TransactionBuilder } from './lib/TransactionBuilder/TransactionBuilder.js';
export { TransactionBuilder };

import { Trx } from './lib/trx.js';
export { Trx };

import { Contract, Method } from './lib/contract/index.js';
export { Contract, Method };

import { Event } from './lib/event.js';
export { Event };

import { Plugin } from './lib/plugin.js';
export { Plugin };

import { TronWeb } from './tronweb.js';
export { TronWeb };

import { privateKeyToAccount } from './accounts/index.js';
export { privateKeyToAccount };

import { defineChain } from './chains/index.js';
export { defineChain };

import { http } from './transports/index.js';
export { http };

import { createContract, createPublicClient, createWalletClient, getContract } from './clients/index.js';
export { createContract, createPublicClient, createWalletClient, getContract };

import * as Types from './types/index.js';
export { Types };

export type { Account } from './accounts/index.js';
export type { Chain } from './chains/index.js';
export type {
    ContractFunctions,
    PublicClient,
    PublicClientConfig,
    SendTransactionParams,
    WalletClient,
    WalletClientConfig,
} from './clients/index.js';
export type { HttpTransport, HttpTransportOptions, Transport } from './transports/index.js';

export default {
    utils,
    BigNumber,
    providers,
    TransactionBuilder,
    Trx,
    Contract,
    Method,
    Event,
    Plugin,
    TronWeb,
    privateKeyToAccount,
    defineChain,
    http,
    createPublicClient,
    createWalletClient,
    getContract,
    createContract,
    Types,
};
