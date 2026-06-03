import { TronWeb } from '../../tronweb.js';
import { AbiCoder, keccak256 } from '../../utils/ethersUtils.js';
import { toHex } from '../../utils/address.js';
import { ADDRESS_PREFIX_REGEX } from '../../utils/constants.js';
import { encodeParamsV2ByABI } from '../../utils/abi.js';
import { txCheckWithArgs, txJsonToPb, txPbToTxID, txPbToRawDataHex } from '../../utils/transaction.js';
import { isArray, isHex, isInteger, isNotNullOrUndefined, isObject, isString } from '../../utils/validations.js';
import { Validator } from '../../paramValidator/index.js';
import type { HttpProvider } from '../providers/index.js';
import { Address } from '../../types/Trx.js';
import { CreateSmartContractTransaction, SignedTransaction, Transaction, TransactionWrapper } from '../../types/Transaction.js';
import { GetSignWeightResponse } from '../../types/APIResponse.js';
import { ConstructorFragment, ContractAbiInterface, FunctionFragment } from '../../types/ABI.js';
import {
    AccountCreateContract,
    AccountPermissionUpdateContract,
    AccountUpdateContract,
    AssetIssueContract,
    CancelFreezeBalanceV2Contract,
    ClearABIContract,
    ContractParamter,
    ContractType,
    CreateSmartContract,
    DelegateResourceContract,
    DeployConstantContract,
    ExchangeCreateContract,
    ExchangeInjectContract,
    ExchangeTransactionContract,
    ExchangeWithdrawContract,
    FreezeBalanceContract,
    FreezeBalanceV2Contract,
    ParticipateAssetIssueContract,
    Permission,
    ProposalCreateContract,
    ProposalDeleteContract,
    SetAccountIdContract,
    TransferAssetContract,
    TransferContract,
    TriggerSmartContract,
    UnDelegateResourceContract,
    UnfreezeBalanceContract,
    UnfreezeBalanceV2Contract,
    UpdateAssetContract,
    UpdateBrokerageContract,
    UpdateEnergyLimitContract,
    UpdateSettingContract,
    VoteProposalContract,
    VoteWitnessContract,
    WithdrawBalanceContract,
    WithdrawExpireUnfreezeContract,
    WitnessCreateContract,
} from '../../types/Contract.js';
import {
    AlterTransactionOptions,
    CreateSmartContractOptions,
    CreateTokenOptions,
    DeployConstantContractOptions,
    TriggerConstantContractOptions,
    TransactionCommonOptions,
    Resource,
    ContractFunctionParameter,
    TriggerSmartContractOptions,
    TxLocal,
    UpdateTokenOptions,
    VoteInfo,
} from '../../types/TransactionBuilder.js';
import { getCurrentRefBlockParams } from './trx.js';

const validator = new Validator();

// ---------- shared helpers ----------

export function fromUtf8(value: string) {
    return TronWeb.fromUtf8(value).replace(/^0x/, '');
}

export function deepCopyJson<T = unknown>(json: object): T {
    return JSON.parse(JSON.stringify(json));
}

export function genContractAddress(ownerAddress: string, txID: string) {
    return (
        '41' +
        keccak256('0x' + txID + ownerAddress)
            .toString()
            .substring(2)
            .slice(24)
    );
}

export function resultManager(transaction: TransactionWrapper, data: unknown, options: TriggerConstantContractOptions) {
    if (transaction.Error) throw new Error(transaction.Error);

    if (transaction.result && transaction.result.message) {
        throw new Error(TronWeb.toUtf8(transaction.result.message));
    }
    const authResult = txCheckWithArgs(transaction, data, options);
    if (authResult) {
        return transaction;
    }
    throw new Error('Invalid transaction');
}

export function resultManagerTriggerSmartContract(
    transaction: TransactionWrapper,
    data: unknown,
    options: TriggerConstantContractOptions
) {
    if (transaction.Error) throw new Error(transaction.Error);

    if (transaction.result && transaction.result.message) {
        throw new Error(TronWeb.toUtf8(transaction.result.message));
    }

    if (!(options._isConstant || options.estimateEnergy)) {
        const authResult = txCheckWithArgs(transaction.transaction, data, options);
        if (authResult) {
            return transaction;
        }
        throw new Error('Invalid transaction');
    }
    return transaction;
}

export function checkBlockHeader(options = {} as Partial<Transaction['raw_data']>): boolean {
    if (
        typeof options['ref_block_bytes'] === 'undefined' &&
        typeof options['ref_block_hash'] === 'undefined' &&
        typeof options['expiration'] === 'undefined' &&
        typeof options['timestamp'] === 'undefined'
    ) {
        return false;
    }
    if (typeof options['ref_block_bytes'] !== 'string') {
        throw new Error('Invalid ref_block_bytes provided.');
    }
    if (typeof options['ref_block_hash'] !== 'string') {
        throw new Error('Invalid ref_block_hash provided.');
    }
    if (typeof options['expiration'] !== 'number') {
        throw new Error('Invalid expiration provided.');
    }
    if (typeof options['timestamp'] !== 'number') {
        throw new Error('Invalid timestamp provided.');
    }
    return true;
}

export function getTransactionOptions(options: { blockHeader?: Partial<Transaction['raw_data']> } = {}) {
    const ret = {} as Partial<Transaction['raw_data']>;
    if (checkBlockHeader(options.blockHeader)) {
        ret['ref_block_bytes'] = options.blockHeader!['ref_block_bytes'];
        ret['ref_block_hash'] = options.blockHeader!['ref_block_hash'];
        ret['expiration'] = options.blockHeader!['expiration'];
        ret['timestamp'] = options.blockHeader!['timestamp'];
    }
    return ret;
}

export async function createTransaction<T extends ContractParamter>(
    fullNode: HttpProvider,
    type: ContractType,
    value: T,
    Permission_id?: number,
    options = {} as Partial<Omit<Transaction['raw_data'], 'contract'>>
): Promise<Transaction<T>> {
    const tx: Transaction<T> = {
        visible: false,
        txID: '',
        raw_data_hex: '',
        raw_data: {
            contract: [
                {
                    parameter: {
                        value,
                        type_url: `type.googleapis.com/protocol.${type}`,
                    },
                    type,
                },
            ],
            ...(checkBlockHeader(options) ? ({} as Transaction['raw_data']) : await getCurrentRefBlockParams(fullNode)),
            ...options,
        },
    };
    if (Permission_id) {
        tx.raw_data.contract[0].Permission_id = Permission_id;
    }
    const pb = txJsonToPb(tx);
    tx.txID = txPbToTxID(pb).replace(/^0x/, '');
    tx.raw_data_hex = txPbToRawDataHex(pb).toLowerCase();
    return tx;
}

// ---------- builders: TRX / token / resources ----------

export async function sendTrx(
    fullNode: HttpProvider,
    to: string,
    amount: number,
    from: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<TransferContract>> {
    amount = parseInt(amount);

    validator.notValid([
        { name: 'recipient', type: 'address', value: to },
        { name: 'origin', type: 'address', value: from as string },
        { names: ['recipient', 'origin'], type: 'notEqual', msg: 'Cannot transfer TRX to the same account' },
        { name: 'amount', type: 'integer', gt: 0, value: amount },
    ]);

    const data: TransferContract = {
        to_address: toHex(to),
        owner_address: toHex(from as string),
        amount,
    };

    return createTransaction<TransferContract>(
        fullNode,
        ContractType.TransferContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function sendToken(
    fullNode: HttpProvider,
    to: string,
    amount: number,
    tokenId: string,
    from: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<TransferAssetContract>> {
    amount = parseInt(amount);
    validator.notValid([
        { name: 'recipient', type: 'address', value: to },
        { name: 'origin', type: 'address', value: from as string },
        { names: ['recipient', 'origin'], type: 'notEqual', msg: 'Cannot transfer tokens to the same account' },
        { name: 'amount', type: 'integer', gt: 0, value: amount },
        { name: 'token ID', type: 'tokenId', value: tokenId },
    ]);

    const data: TransferAssetContract = {
        to_address: toHex(to),
        owner_address: toHex(from as string),
        asset_name: fromUtf8(tokenId as string),
        amount,
    };

    return createTransaction<TransferAssetContract>(
        fullNode,
        ContractType.TransferAssetContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function purchaseToken(
    fullNode: HttpProvider,
    issuerAddress: string,
    tokenId: string,
    amount: number,
    buyer: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<ParticipateAssetIssueContract>> {
    validator.notValid([
        { name: 'buyer', type: 'address', value: buyer as string },
        { name: 'issuer', type: 'address', value: issuerAddress },
        { names: ['buyer', 'issuer'], type: 'notEqual', msg: 'Cannot purchase tokens from same account' },
        { name: 'amount', type: 'integer', gt: 0, value: amount },
        { name: 'token ID', type: 'tokenId', value: tokenId },
    ]);

    const data: ParticipateAssetIssueContract = {
        to_address: toHex(issuerAddress),
        owner_address: toHex(buyer as string),
        asset_name: fromUtf8(tokenId as string),
        amount: parseInt(amount),
    };

    return createTransaction<ParticipateAssetIssueContract>(
        fullNode,
        ContractType.ParticipateAssetIssueContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function freezeBalance(
    fullNode: HttpProvider,
    amount: number,
    duration: number,
    resource: Resource,
    ownerAddress: string,
    receiverAddress?: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<FreezeBalanceContract>> {
    validator.notValid([
        { name: 'origin', type: 'address', value: ownerAddress as string },
        { name: 'receiver', type: 'address', value: receiverAddress as string, optional: true },
        { name: 'amount', type: 'integer', gt: 0, value: amount },
        { name: 'duration', type: 'integer', gte: 3, value: duration },
        { name: 'resource', type: 'resource', value: resource, msg: 'Invalid resource provided: Expected "BANDWIDTH" or "ENERGY"' },
    ]);
    const data: FreezeBalanceContract = {
        owner_address: toHex(ownerAddress as string),
        frozen_balance: parseInt(amount),
        frozen_duration: parseInt(String(duration)),
    };
    if (resource !== 'BANDWIDTH') {
        data.resource = resource as Resource;
    }

    if (isNotNullOrUndefined(receiverAddress) && toHex(receiverAddress as string) !== toHex(ownerAddress as string)) {
        data.receiver_address = toHex(receiverAddress as string);
    }

    return createTransaction<FreezeBalanceContract>(
        fullNode,
        ContractType.FreezeBalanceContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function unfreezeBalance(
    fullNode: HttpProvider,
    resource: Resource,
    address: string,
    receiverAddress?: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<UnfreezeBalanceContract>> {
    validator.notValid([
        { name: 'origin', type: 'address', value: address as string },
        { name: 'receiver', type: 'address', value: receiverAddress as string, optional: true },
        { name: 'resource', type: 'resource', value: resource, msg: 'Invalid resource provided: Expected "BANDWIDTH" or "ENERGY"' },
    ]);
    const data: Partial<UnfreezeBalanceContract> = {
        owner_address: toHex(address as string),
    };
    if (resource !== 'BANDWIDTH') {
        data.resource = resource as Resource;
    }

    if (isNotNullOrUndefined(receiverAddress) && toHex(receiverAddress as string) !== toHex(address as string)) {
        data.receiver_address = toHex(receiverAddress as string);
    }

    return createTransaction<UnfreezeBalanceContract>(
        fullNode,
        ContractType.UnfreezeBalanceContract,
        data as UnfreezeBalanceContract,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function freezeBalanceV2(
    fullNode: HttpProvider,
    amount: number,
    resource: Resource,
    address: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<FreezeBalanceV2Contract>> {
    validator.notValid([
        { name: 'origin', type: 'address', value: address as string },
        { name: 'amount', type: 'integer', gt: 0, value: amount },
        { name: 'resource', type: 'resource', value: resource as string, msg: 'Invalid resource provided: Expected "BANDWIDTH" or "ENERGY"' },
    ]);
    const data: FreezeBalanceV2Contract = {
        owner_address: toHex(address as string),
        frozen_balance: parseInt(amount),
    };
    if (resource !== 'BANDWIDTH') {
        data.resource = resource as Resource;
    }

    return createTransaction<FreezeBalanceV2Contract>(
        fullNode,
        ContractType.FreezeBalanceV2Contract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function unfreezeBalanceV2(
    fullNode: HttpProvider,
    amount: number,
    resource: Resource,
    address: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<UnfreezeBalanceV2Contract>> {
    validator.notValid([
        { name: 'origin', type: 'address', value: address as string },
        { name: 'amount', type: 'integer', gt: 0, value: amount },
        { name: 'resource', type: 'resource', value: resource as string, msg: 'Invalid resource provided: Expected "BANDWIDTH" or "ENERGY"' },
    ]);
    const data: UnfreezeBalanceV2Contract = {
        owner_address: toHex(address as string),
        unfreeze_balance: parseInt(amount),
    };
    if (resource !== 'BANDWIDTH') {
        data.resource = resource as Resource;
    }

    return createTransaction<UnfreezeBalanceV2Contract>(
        fullNode,
        ContractType.UnfreezeBalanceV2Contract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function cancelUnfreezeBalanceV2(
    fullNode: HttpProvider,
    address: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<CancelFreezeBalanceV2Contract>> {
    validator.notValid([{ name: 'origin', type: 'address', value: address as string }]);
    const data: CancelFreezeBalanceV2Contract = {
        owner_address: toHex(address as string),
    };

    return createTransaction<CancelFreezeBalanceV2Contract>(
        fullNode,
        ContractType.CancelAllUnfreezeV2Contract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function delegateResource(
    fullNode: HttpProvider,
    amount: number,
    receiverAddress: string,
    resource: Resource,
    address: string,
    lock: boolean,
    lockPeriod?: number,
    options: TransactionCommonOptions = {}
): Promise<Transaction<DelegateResourceContract>> {
    validator.notValid([
        { name: 'amount', type: 'integer', gt: 0, value: amount },
        { name: 'resource', type: 'resource', value: resource as string, msg: 'Invalid resource provided: Expected "BANDWIDTH" or "ENERGY"' },
        { name: 'receiver', type: 'address', value: receiverAddress },
        { name: 'origin', type: 'address', value: address as string },
        { name: 'lock', type: 'boolean', value: lock as boolean },
        { name: 'lock period', type: 'integer', gte: 0, value: lockPeriod as number, optional: true },
    ]);
    if (toHex(receiverAddress) === toHex(address as string)) {
        throw new Error('Receiver address must not be the same as owner address');
    }

    const data: DelegateResourceContract = {
        owner_address: toHex(address as string),
        receiver_address: toHex(receiverAddress),
        balance: parseInt(amount),
    };
    if (resource !== 'BANDWIDTH') {
        data.resource = resource as Resource;
    }
    if (lock) {
        data.lock = lock as boolean;
        if (isNotNullOrUndefined(lockPeriod)) {
            data.lock_period = lockPeriod as number;
        }
    }

    return createTransaction<DelegateResourceContract>(
        fullNode,
        ContractType.DelegateResourceContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function undelegateResource(
    fullNode: HttpProvider,
    amount: number,
    receiverAddress: string,
    resource: Resource,
    address: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<UnDelegateResourceContract>> {
    validator.notValid([
        { name: 'origin', type: 'address', value: address as string },
        { name: 'receiver', type: 'address', value: receiverAddress },
        { name: 'amount', type: 'integer', gt: 0, value: amount },
        { name: 'resource', type: 'resource', value: resource as string, msg: 'Invalid resource provided: Expected "BANDWIDTH" or "ENERGY"' },
    ]);

    if (toHex(receiverAddress) === toHex(address as string)) {
        throw new Error('Receiver address must not be the same as owner address');
    }

    const data: UnDelegateResourceContract = {
        owner_address: toHex(address as string),
        receiver_address: toHex(receiverAddress),
        balance: parseInt(amount),
    };
    if (resource !== 'BANDWIDTH') {
        data.resource = resource as Resource;
    }

    return createTransaction<UnDelegateResourceContract>(
        fullNode,
        ContractType.UnDelegateResourceContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function withdrawExpireUnfreeze(
    fullNode: HttpProvider,
    address: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<WithdrawExpireUnfreezeContract>> {
    validator.notValid([{ name: 'origin', type: 'address', value: address }]);

    const data: WithdrawExpireUnfreezeContract = { owner_address: toHex(address) };

    return createTransaction<WithdrawExpireUnfreezeContract>(
        fullNode,
        ContractType.WithdrawExpireUnfreezeContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function withdrawBlockRewards(
    fullNode: HttpProvider,
    address: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<WithdrawBalanceContract>> {
    validator.notValid([{ name: 'origin', type: 'address', value: address as string }]);

    const data: WithdrawBalanceContract = { owner_address: toHex(address as string) };

    return createTransaction<WithdrawBalanceContract>(
        fullNode,
        ContractType.WithdrawBalanceContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function applyForSR(
    fullNode: HttpProvider,
    address: string,
    url: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<WitnessCreateContract>> {
    validator.notValid([
        { name: 'origin', type: 'address', value: address },
        { name: 'url', type: 'url', value: url as string, msg: 'Invalid url provided' },
        { name: 'url', type: 'string', value: url as string, lte: 256, msg: 'Invalid url provided' },
    ]);

    const data: WitnessCreateContract = {
        owner_address: toHex(address as string),
        url: fromUtf8(url as string),
    };

    return createTransaction<WitnessCreateContract>(
        fullNode,
        ContractType.WitnessCreateContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function vote(
    fullNode: HttpProvider,
    votes: VoteInfo,
    voterAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<VoteWitnessContract>> {
    validator.notValid([
        { name: 'voter', type: 'address', value: voterAddress as string },
        { name: 'votes', type: 'notEmptyObject', value: votes as VoteInfo },
    ]);

    const entries = Object.entries(votes);
    for (const [srAddress, voteCount] of entries) {
        validator.notValid([
            { name: 'SR', type: 'address', value: srAddress },
            { name: 'vote count', type: 'integer', gt: 0, value: voteCount, msg: 'Invalid vote count provided for SR: ' + srAddress },
        ]);
    }
    const voteList = entries.map(([srAddress, voteCount]) => ({
        vote_address: toHex(srAddress),
        vote_count: parseInt(voteCount),
    }));

    const data: VoteWitnessContract = {
        owner_address: toHex(voterAddress as string),
        votes: voteList,
    };

    return createTransaction<VoteWitnessContract>(
        fullNode,
        ContractType.VoteWitnessContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

// ---------- builders: smart contract ----------

interface TriggerSmartContractArgs extends TriggerSmartContract {
    function_selector?: string;
    parameter?: string;
    fee_limit?: number;
    Permission_id?: number;
}

function buildTriggerSmartContractArgs(
    contractAddress: string,
    functionSelector: string,
    options: TriggerConstantContractOptions,
    parameters: ContractFunctionParameter[],
    issuerAddress: string,
    tokenValue?: number,
    tokenId?: string,
    callValue?: number,
    feeLimit?: number
) {
    const args: TriggerSmartContractArgs = {
        contract_address: toHex(contractAddress),
        owner_address: toHex(issuerAddress),
    };

    if (functionSelector && isString(functionSelector)) {
        functionSelector = functionSelector.replace(/\s*/g, '');
        let parameterStr;
        if (parameters.length) {
            const abiCoder = new AbiCoder();
            let types = [];
            const values = [];

            for (let i = 0; i < parameters.length; i++) {
                let { value } = parameters[i];
                const { type } = parameters[i];

                if (!type || !isString(type) || !type.length) throw new Error('Invalid parameter type provided: ' + type);

                const replaceAddressPrefix = (value: unknown): any => {
                    if (isArray(value)) {
                        return value.map((v) => replaceAddressPrefix(v));
                    }
                    return toHex(value as string).replace(ADDRESS_PREFIX_REGEX, '0x');
                };
                if (type === 'address') value = replaceAddressPrefix(value);
                else if (type.match(/^([^\x5b]*)(\x5b|$)/)?.[0] === 'address[') value = replaceAddressPrefix(value);

                types.push(type);
                values.push(value);
            }

            try {
                types = types.map((type) => {
                    if (/trcToken/.test(type)) {
                        type = type.replace(/trcToken/, 'uint256');
                    }
                    return type;
                });

                parameterStr = abiCoder.encode(types, values).replace(/^(0x)/, '');
            } catch (ex) {
                throw new Error(ex as string);
            }
        } else parameterStr = '';

        if (options.funcABIV2) {
            parameterStr = encodeParamsV2ByABI(
                options.funcABIV2 as FunctionFragment,
                options.parametersV2 as unknown[]
            ).replace(/^(0x)/, '');
        }

        if (options.shieldedParameter && isString(options.shieldedParameter)) {
            parameterStr = options.shieldedParameter.replace(/^(0x)/, '');
        }

        if (options.rawParameter && isString(options.rawParameter)) {
            parameterStr = options.rawParameter.replace(/^(0x)/, '');
        }

        args.function_selector = functionSelector;
        args.parameter = parameterStr;
    } else if (options.input) {
        args.data = options.input;
    }

    args.call_value = parseInt(callValue as number);
    if (isNotNullOrUndefined(tokenValue)) args.call_token_value = parseInt(tokenValue as number);
    if (isNotNullOrUndefined(tokenId)) args.token_id = parseInt(tokenId as string);

    if (!(options._isConstant || options.estimateEnergy)) {
        args.fee_limit = parseInt(feeLimit as number);
    }

    if (options.permissionId) {
        args.Permission_id = options.permissionId;
    }

    return args;
}

async function triggerSmartContractLocalInternal(
    fullNode: HttpProvider,
    contractAddress: string,
    functionSelector: string,
    options: TriggerConstantContractOptions,
    parameters: ContractFunctionParameter[],
    issuerAddress: string
) {
    const { tokenValue, tokenId, callValue = 0, feeLimit } = options;

    validator.notValid([
        { name: 'feeLimit', type: 'integer', value: feeLimit, gt: 0 },
        { name: 'callValue', type: 'integer', value: callValue, gte: 0 },
        { name: 'parameters', type: 'array', value: parameters },
        { name: 'contract', type: 'address', value: contractAddress },
        { name: 'issuer', type: 'address', value: issuerAddress, optional: true },
        { name: 'tokenValue', type: 'integer', value: tokenValue, gte: 0, optional: true },
        { name: 'tokenId', type: 'integer', value: tokenId, gte: 0, optional: true },
    ]);

    const args = buildTriggerSmartContractArgs(
        contractAddress,
        functionSelector,
        options,
        parameters,
        issuerAddress,
        tokenValue,
        tokenId,
        callValue,
        feeLimit
    );

    if (args.function_selector) {
        args.data = keccak256(new TextEncoder().encode(args.function_selector)).toString().substring(2, 10) + args.parameter;
    }
    const value: TriggerSmartContract = {
        data: args.data,
        owner_address: args.owner_address,
        contract_address: args.contract_address,
    };
    if (args.call_value) value.call_value = args.call_value;
    if (args.call_token_value) value.call_token_value = args.call_token_value;
    if (args.token_id) value.token_id = args.token_id;

    const transaction = await createTransaction<TriggerSmartContract>(
        fullNode,
        ContractType.TriggerSmartContract,
        value,
        options.permissionId,
        {
            ...getTransactionOptions(options),
            fee_limit: args.fee_limit,
        }
    );
    return {
        result: { result: true },
        transaction,
    };
}

async function triggerSmartContractRemote(
    fullNode: HttpProvider,
    solidityNode: HttpProvider,
    contractAddress: string,
    functionSelector: string,
    options: TriggerConstantContractOptions,
    parameters: ContractFunctionParameter[],
    issuerAddress: string
) {
    const { tokenValue, tokenId, callValue = 0, feeLimit } = options;

    validator.notValid([
        { name: 'feeLimit', type: 'integer', value: feeLimit, gt: 0 },
        { name: 'callValue', type: 'integer', value: callValue, gte: 0 },
        { name: 'parameters', type: 'array', value: parameters },
        { name: 'contract', type: 'address', value: contractAddress },
        { name: 'issuer', type: 'address', value: issuerAddress, optional: true },
        { name: 'tokenValue', type: 'integer', value: tokenValue, gte: 0, optional: true },
        { name: 'tokenId', type: 'integer', value: tokenId, gte: 0, optional: true },
    ]);
    const args = buildTriggerSmartContractArgs(
        contractAddress,
        functionSelector,
        options,
        parameters,
        issuerAddress,
        tokenValue,
        tokenId,
        callValue,
        feeLimit
    );

    let pathInfo = 'triggersmartcontract';
    if (options._isConstant) {
        pathInfo = 'triggerconstantcontract';
    } else if (options.estimateEnergy) {
        pathInfo = 'estimateenergy';
    }

    pathInfo = `wallet${options.confirmed ? 'solidity' : ''}/${pathInfo}`;
    const node = options.confirmed ? solidityNode : fullNode;
    const transaction: TransactionWrapper = await node.request(pathInfo, args, 'post');
    return resultManagerTriggerSmartContract(transaction, args, options);
}

export async function createSmartContract(
    fullNode: HttpProvider,
    options: CreateSmartContractOptions,
    issuerAddress: string
): Promise<CreateSmartContractTransaction> {
    const feeLimit = options.feeLimit;
    let userFeePercentage = options.userFeePercentage;
    if (typeof userFeePercentage !== 'number' && !userFeePercentage) {
        userFeePercentage = 100;
    }
    const originEnergyLimit = options.originEnergyLimit || 10_000_000;
    const callValue = options.callValue || 0;
    const tokenValue = options.tokenValue;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const tokenId = options.tokenId || options.token_id;

    let { abi } = options;
    const { parameters = [] } = options;
    let parameter = '';
    const { bytecode = false, name = '' } = options;
    if (abi && isString(abi)) {
        try {
            abi = JSON.parse(abi);
        } catch {
            throw new Error('Invalid options.abi provided');
        }
    }

    const newAbi = abi as { entrys: ContractAbiInterface } | ContractAbiInterface;
    let entries: ContractAbiInterface | null = newAbi as ContractAbiInterface;
    if ((newAbi as { entrys: ContractAbiInterface }).entrys) {
        entries = (newAbi as { entrys: ContractAbiInterface }).entrys;
    }

    if (!isArray(entries)) throw new Error('Invalid options.abi provided');

    const payable = entries.some((func) => {
        return func.type === 'constructor' && 'payable' === (func as ConstructorFragment).stateMutability.toLowerCase();
    });

    validator.notValid([
        { name: 'bytecode', type: 'hex', value: bytecode },
        { name: 'feeLimit', type: 'integer', value: feeLimit, gt: 0 },
        { name: 'callValue', type: 'integer', value: callValue, gte: 0 },
        { name: 'userFeePercentage', type: 'integer', value: userFeePercentage, gte: 0, lte: 100 },
        { name: 'originEnergyLimit', type: 'integer', value: originEnergyLimit, gte: 0, lte: 10_000_000 },
        { name: 'parameters', type: 'array', value: parameters },
        { name: 'issuer', type: 'address', value: issuerAddress },
        { name: 'tokenValue', type: 'integer', value: tokenValue, gte: 0, optional: true },
        { name: 'tokenId', type: 'integer', value: tokenId, gte: 0, optional: true },
    ]);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (!payable && (callValue > 0 || tokenValue > 0))
        throw new Error('When contract is not payable, options.callValue and options.tokenValue must be 0');

    const { rawParameter, funcABIV2, parametersV2 } = options as any;
    if (rawParameter && isString(rawParameter)) {
        parameter = rawParameter.replace(/^(0x)/, '');
    } else if (funcABIV2) {
        parameter = encodeParamsV2ByABI(funcABIV2, parametersV2).replace(/^(0x)/, '');
    } else {
        let constructorParams: any = entries.find((it: any) => it.type === 'constructor');

        if (typeof constructorParams !== 'undefined' && constructorParams) {
            const abiCoder = new AbiCoder();
            const types = [];
            const values = [];
            constructorParams = constructorParams.inputs;

            if (parameters.length != constructorParams.length)
                throw new Error(`constructor needs ${constructorParams.length} but ${parameters.length} provided`);

            for (let i = 0; i < parameters.length; i++) {
                let type = constructorParams[i].type;
                let value: any = parameters[i];

                if (!type || !isString(type) || !type.length) throw new Error('Invalid parameter type provided: ' + type);

                const replaceAddressPrefix = (value: unknown): any => {
                    if (isArray(value)) {
                        return value.map((v) => replaceAddressPrefix(v));
                    }
                    return toHex(value as string).replace(ADDRESS_PREFIX_REGEX, '0x');
                };
                if (type === 'address') value = replaceAddressPrefix(value);
                else if (type.match(/^([^\x5b]*)(\x5b|$)/)?.[0] === 'address[') value = replaceAddressPrefix(value);
                else if (/trcToken/.test(type)) {
                    type = type.replace(/trcToken/, 'uint256');
                }

                types.push(type);
                values.push(value);
            }

            try {
                parameter = abiCoder.encode(types, values).replace(/^(0x)/, '');
            } catch (ex) {
                throw new Error(ex as string);
            }
        } else {
            parameter = '';
        }
    }

    const args: any = {
        owner_address: toHex(issuerAddress),
        fee_limit: parseInt(feeLimit as number),
        call_value: parseInt(callValue),
        consume_user_resource_percent: userFeePercentage,
        origin_energy_limit: originEnergyLimit,
        abi: JSON.stringify(entries),
        bytecode,
        parameter,
        name,
    };

    if (isNotNullOrUndefined(tokenValue)) {
        args.call_token_value = parseInt(tokenValue as number);
    }
    if (isNotNullOrUndefined(tokenId)) {
        args.token_id = parseInt(tokenId);
    }

    const contract: CreateSmartContract = {} as CreateSmartContract;
    contract.owner_address = args.owner_address;
    if (isNotNullOrUndefined(args.call_token_value)) {
        contract.call_token_value = args.call_token_value;
    }
    if (isNotNullOrUndefined(args.token_id)) {
        contract.token_id = args.token_id;
    }
    const new_contract = (contract.new_contract = {} as CreateSmartContract['new_contract']);

    if (args.abi) {
        new_contract.abi = { entrys: JSON.parse(args.abi) };
    } else {
        new_contract.abi = {};
    }
    if (args.call_value) {
        new_contract.call_value = args.call_value;
    }
    new_contract.consume_user_resource_percent = args.consume_user_resource_percent;
    new_contract.origin_energy_limit = args.origin_energy_limit;
    new_contract.origin_address = args.origin_address ?? args.owner_address;
    if (args.bytecode + args.parameter) {
        new_contract.bytecode = (args.bytecode + args.parameter).replace(/^0x/, '');
    }
    if (isNotNullOrUndefined(args.name)) {
        new_contract.name = args.name;
    }
    const tx = (await createTransaction(fullNode, ContractType.CreateSmartContract, contract, options?.permissionId, {
        ...getTransactionOptions(options),
        fee_limit: args.fee_limit,
    })) as CreateSmartContractTransaction;
    tx.contract_address = genContractAddress(args.owner_address, tx.txID);
    return tx;
}

export async function triggerSmartContract(
    fullNode: HttpProvider,
    solidityNode: HttpProvider,
    contractAddress: string,
    functionSelector: string,
    options: TriggerSmartContractOptions,
    parameters: ContractFunctionParameter[],
    issuerAddress: string
): Promise<TransactionWrapper> {
    if (options?.txLocal) {
        return triggerSmartContractLocalInternal(fullNode, contractAddress, functionSelector, options, parameters, issuerAddress);
    }
    return triggerSmartContractRemote(fullNode, solidityNode, contractAddress, functionSelector, options, parameters, issuerAddress);
}

export async function triggerConstantContract(
    fullNode: HttpProvider,
    solidityNode: HttpProvider,
    contractAddress: string,
    functionSelector: string,
    options: TriggerConstantContractOptions,
    parameters: ContractFunctionParameter[],
    issuerAddress: string
): Promise<TransactionWrapper> {
    options._isConstant = true;
    return triggerSmartContractRemote(fullNode, solidityNode, contractAddress, functionSelector, options, parameters, issuerAddress);
}

export async function triggerConfirmedConstantContract(
    fullNode: HttpProvider,
    solidityNode: HttpProvider,
    contractAddress: string,
    functionSelector: string,
    options: TriggerConstantContractOptions,
    parameters: ContractFunctionParameter[],
    issuerAddress: string
): Promise<TransactionWrapper> {
    options._isConstant = true;
    options.confirmed = true;
    return triggerSmartContractRemote(fullNode, solidityNode, contractAddress, functionSelector, options, parameters, issuerAddress);
}

export async function estimateEnergy(
    fullNode: HttpProvider,
    solidityNode: HttpProvider,
    contractAddress: string,
    functionSelector: string,
    options: TriggerConstantContractOptions,
    parameters: ContractFunctionParameter[],
    issuerAddress: string
): Promise<{ result: { result: boolean }; energy_required: number }> {
    options.estimateEnergy = true;
    const result = await triggerSmartContractRemote(fullNode, solidityNode, contractAddress, functionSelector, options, parameters, issuerAddress);
    return result as { result: { result: boolean }; energy_required: number };
}

export async function deployConstantContract(
    fullNode: HttpProvider,
    solidityNode: HttpProvider,
    options: DeployConstantContractOptions
) {
    const { input, ownerAddress, tokenId, tokenValue, callValue = 0 } = options;

    validator.notValid([
        { name: 'input', type: 'not-empty-string', value: input },
        { name: 'callValue', type: 'integer', value: callValue, gte: 0 },
        { name: 'owner', type: 'address', value: ownerAddress },
        { name: 'tokenValue', type: 'integer', value: tokenValue, gte: 0, optional: true },
        { name: 'tokenId', type: 'integer', value: tokenId, gte: 0, optional: true },
    ]);

    const args: DeployConstantContract = {
        data: input,
        owner_address: toHex(ownerAddress),
        call_value: callValue,
    };

    if (tokenId) args.token_id = tokenId;
    if (tokenValue) args.call_token_value = tokenValue;

    const pathInfo = `wallet${options.confirmed ? 'solidity' : ''}/estimateenergy`;
    const node = options.confirmed ? solidityNode : fullNode;
    const transaction: TransactionWrapper = await node.request(pathInfo, args, 'post');
    if (transaction.Error) throw new Error(transaction.Error);

    if (transaction.result && transaction.result.message) {
        throw new Error(TronWeb.toUtf8(transaction.result.message));
    }
    return transaction as { result: { result: boolean }; energy_required: number };
}

export async function clearABI(
    fullNode: HttpProvider,
    cache: { contracts: Record<string, unknown> },
    contractAddress: string,
    ownerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<ClearABIContract>> {
    if (!TronWeb.isAddress(contractAddress)) throw new Error('Invalid contract address provided');
    if (!TronWeb.isAddress(ownerAddress)) throw new Error('Invalid owner address provided');
    const data: ClearABIContract = {
        contract_address: toHex(contractAddress),
        owner_address: toHex(ownerAddress as string),
    };

    if (cache.contracts[contractAddress]) {
        delete cache.contracts[contractAddress];
    }

    return createTransaction<ClearABIContract>(
        fullNode,
        ContractType.ClearABIContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function updateBrokerage(
    fullNode: HttpProvider,
    brokerage: number,
    ownerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<UpdateBrokerageContract>> {
    if (!isNotNullOrUndefined(brokerage)) throw new Error('Invalid brokerage provided');

    if (!isInteger(brokerage) || brokerage < 0 || brokerage > 100)
        throw new Error('Brokerage must be an integer between 0 and 100');

    if (!TronWeb.isAddress(ownerAddress)) throw new Error('Invalid owner address provided');

    const data: UpdateBrokerageContract = {
        brokerage: parseInt(brokerage),
        owner_address: toHex(ownerAddress as string),
    };

    return createTransaction<UpdateBrokerageContract>(
        fullNode,
        ContractType.UpdateBrokerageContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

// ---------- builders: token / account ----------

export async function createToken(
    fullNode: HttpProvider,
    options: CreateTokenOptions,
    issuerAddress: string
): Promise<Transaction<AssetIssueContract>> {
    const {
        name = false,
        abbreviation = false,
        description = '',
        url = false,
        totalSupply = 0,
        trxRatio = 1,
        tokenRatio = 1,
        saleStart = Date.now(),
        saleEnd = false,
        freeBandwidth = 0,
        freeBandwidthLimit = 0,
        frozenAmount = 0,
        frozenDuration = 0,
        voteScore,
        precision,
    } = options;

    validator.notValid([
        { name: 'Supply amount', type: 'positive-integer', value: totalSupply },
        { name: 'TRX ratio', type: 'positive-integer', value: trxRatio },
        { name: 'Token ratio', type: 'positive-integer', value: tokenRatio },
        { name: 'token abbreviation', type: 'string', value: abbreviation, lte: 32, gt: 0 },
        { name: 'token name', type: 'not-empty-string', value: name },
        { name: 'token description', type: 'string', value: description, lte: 200 },
        { name: 'token url', type: 'url', value: url },
        { name: 'token url', type: 'string', value: url, lte: 256 },
        { name: 'issuer', type: 'address', value: issuerAddress },
        { name: 'sale start timestamp', type: 'integer', value: saleStart, gte: Date.now() },
        { name: 'sale end timestamp', type: 'integer', value: saleEnd, gt: saleStart },
        { name: 'Frozen supply', type: 'integer', value: frozenAmount, gte: 0 },
        { name: 'Frozen duration', type: 'integer', value: frozenDuration, gte: 0 },
    ]);

    if (isNotNullOrUndefined(voteScore) && (!isInteger(voteScore) || voteScore <= 0))
        throw new Error('voteScore must be a positive integer greater than 0');

    if (isNotNullOrUndefined(precision) && (!isInteger(precision) || precision < 0 || precision > 6))
        throw new Error('precision must be a positive integer >= 0 and <= 6');

    const data: Partial<AssetIssueContract> = {
        owner_address: toHex(issuerAddress),
        name: fromUtf8(name as string),
        abbr: fromUtf8(abbreviation as string),
        description: fromUtf8(description),
        url: fromUtf8(url as string),
        total_supply: parseInt(totalSupply),
        trx_num: parseInt(trxRatio),
        num: parseInt(tokenRatio),
        start_time: parseInt(saleStart),
        end_time: parseInt(saleEnd as number),
        frozen_supply: [
            {
                frozen_amount: parseInt(frozenAmount),
                frozen_days: parseInt(frozenDuration),
            },
        ],
    };
    (['name', 'abbr', 'description', 'url'] as (keyof typeof data)[]).forEach((key) => {
        if (!data[key]) {
            delete data[key];
        }
    });
    if (!(parseInt(frozenAmount) > 0)) {
        delete data.frozen_supply;
    }
    if (freeBandwidth && !isNaN(parseInt(freeBandwidth)) && parseInt(freeBandwidth) >= 0) {
        data.free_asset_net_limit = parseInt(freeBandwidth);
    }
    if (freeBandwidthLimit && !isNaN(parseInt(freeBandwidthLimit)) && parseInt(freeBandwidthLimit) >= 0) {
        data.public_free_asset_net_limit = parseInt(freeBandwidthLimit);
    }
    if (precision && !isNaN(parseInt(precision))) {
        data.precision = parseInt(precision);
    }
    if (voteScore && !isNaN(parseInt(voteScore))) {
        data.vote_score = parseInt(voteScore);
    }
    return createTransaction<AssetIssueContract>(
        fullNode,
        ContractType.AssetIssueContract,
        data as AssetIssueContract,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function updateToken(
    fullNode: HttpProvider,
    options: UpdateTokenOptions,
    issuerAddress: string
): Promise<Transaction<UpdateAssetContract>> {
    const { description = '', url = false, freeBandwidth = 0, freeBandwidthLimit = 0 } = options;

    validator.notValid([
        { name: 'token description', type: 'string', value: description, lte: 200 },
        { name: 'token url', type: 'url', value: url },
        { name: 'token url', type: 'string', value: url, lte: 256 },
        { name: 'issuer', type: 'address', value: issuerAddress as string },
    ]);

    const data: UpdateAssetContract = {
        owner_address: toHex(issuerAddress as string),
        description: fromUtf8(description),
        url: fromUtf8(url as string),
    };

    if (freeBandwidth && !isNaN(parseInt(freeBandwidth)) && parseInt(freeBandwidth) >= 0) {
        data.new_limit = parseInt(freeBandwidth);
    }
    if (freeBandwidthLimit && !isNaN(parseInt(freeBandwidthLimit)) && parseInt(freeBandwidthLimit) >= 0) {
        data.new_public_limit = parseInt(freeBandwidthLimit);
    }

    return createTransaction<UpdateAssetContract>(
        fullNode,
        ContractType.UpdateAssetContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function createAccount(
    fullNode: HttpProvider,
    accountAddress: string,
    address: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<AccountCreateContract>> {
    validator.notValid([
        { name: 'account', type: 'address', value: accountAddress },
        { name: 'origin', type: 'address', value: address as string },
    ]);
    const data: AccountCreateContract = {
        owner_address: toHex(address as string),
        account_address: toHex(accountAddress),
    };

    return createTransaction<AccountCreateContract>(
        fullNode,
        ContractType.AccountCreateContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function updateAccount(
    fullNode: HttpProvider,
    accountName: string,
    address: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<AccountUpdateContract>> {
    validator.notValid([
        { name: 'Name', type: 'string', lte: 200, gt: 0, value: accountName, msg: 'Invalid accountName' },
        { name: 'origin', type: 'address', value: address as string },
    ]);

    const data: AccountUpdateContract = {
        account_name: fromUtf8(accountName as string),
        owner_address: toHex(address as string),
    };

    return createTransaction<AccountUpdateContract>(
        fullNode,
        ContractType.AccountUpdateContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function setAccountId(
    fullNode: HttpProvider,
    accountId: string,
    address: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<SetAccountIdContract>> {
    if (accountId && isString(accountId) && accountId.startsWith('0x')) {
        accountId = accountId.slice(2);
    }

    validator.notValid([
        { name: 'accountId', type: 'hex', value: accountId },
        { name: 'accountId', type: 'string', lte: 32, gte: 8, value: accountId },
        { name: 'origin', type: 'address', value: address as string },
    ]);

    const data: SetAccountIdContract = {
        account_id: accountId,
        owner_address: toHex(address as string),
    };

    return createTransaction<SetAccountIdContract>(
        fullNode,
        ContractType.SetAccountIdContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

// ---------- builders: proposal / exchange / settings ----------

export async function createProposal(
    fullNode: HttpProvider,
    parameters: Record<string, string | number> | Record<string, string | number>[],
    issuerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<ProposalCreateContract>> {
    validator.notValid([{ name: 'issuer', type: 'address', value: issuerAddress as string }]);

    const invalid = 'Invalid proposal parameters provided';
    if (!parameters) throw new Error(invalid);

    const newParams = isArray(parameters) ? parameters : [parameters];
    for (const parameter of newParams) {
        if (!isObject(parameter)) throw new Error(invalid);
    }

    const data: ProposalCreateContract = {
        owner_address: toHex(issuerAddress as string),
        parameters: newParams,
    };

    return createTransaction<ProposalCreateContract>(
        fullNode,
        ContractType.ProposalCreateContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function deleteProposal(
    fullNode: HttpProvider,
    proposalID: number,
    issuerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<ProposalDeleteContract>> {
    validator.notValid([
        { name: 'issuer', type: 'address', value: issuerAddress as string },
        { name: 'proposalID', type: 'integer', value: proposalID, gte: 0 },
    ]);

    const data: ProposalDeleteContract = {
        owner_address: toHex(issuerAddress as string),
        proposal_id: parseInt(proposalID as number),
    };

    return createTransaction<ProposalDeleteContract>(
        fullNode,
        ContractType.ProposalDeleteContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function voteProposal(
    fullNode: HttpProvider,
    proposalID: number,
    isApproval: boolean,
    voterAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<VoteProposalContract>> {
    validator.notValid([
        { name: 'voter', type: 'address', value: voterAddress as string },
        { name: 'proposalID', type: 'integer', value: proposalID, gte: 0 },
        { name: 'has approval', type: 'boolean', value: isApproval },
    ]);

    const data: VoteProposalContract = {
        owner_address: toHex(voterAddress as string),
        proposal_id: parseInt(proposalID),
        is_add_approval: isApproval,
    };

    return createTransaction(
        fullNode,
        ContractType.ProposalApproveContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function createTRXExchange(
    fullNode: HttpProvider,
    tokenName: string,
    tokenBalance: number,
    trxBalance: number,
    ownerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<ExchangeCreateContract>> {
    validator.notValid([
        { name: 'owner', type: 'address', value: ownerAddress as string },
        { name: 'token name', type: 'not-empty-string', value: tokenName },
        { name: 'token balance', type: 'positive-integer', value: tokenBalance },
        { name: 'trx balance', type: 'positive-integer', value: trxBalance },
    ]);

    const data: ExchangeCreateContract = {
        owner_address: toHex(ownerAddress as string),
        first_token_id: fromUtf8(tokenName),
        first_token_balance: tokenBalance,
        second_token_id: '5f',
        second_token_balance: trxBalance,
    };

    return createTransaction(
        fullNode,
        ContractType.ExchangeCreateContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function createTokenExchange(
    fullNode: HttpProvider,
    firstTokenName: string,
    firstTokenBalance: number,
    secondTokenName: string,
    secondTokenBalance: number,
    ownerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<ExchangeCreateContract>> {
    validator.notValid([
        { name: 'owner', type: 'address', value: ownerAddress as string },
        { name: 'first token name', type: 'not-empty-string', value: firstTokenName },
        { name: 'second token name', type: 'not-empty-string', value: secondTokenName },
        { name: 'first token balance', type: 'positive-integer', value: firstTokenBalance },
        { name: 'second token balance', type: 'positive-integer', value: secondTokenBalance },
    ]);

    const data: ExchangeCreateContract = {
        owner_address: toHex(ownerAddress as string),
        first_token_id: fromUtf8(firstTokenName),
        first_token_balance: firstTokenBalance,
        second_token_id: fromUtf8(secondTokenName),
        second_token_balance: secondTokenBalance,
    };

    return createTransaction<ExchangeCreateContract>(
        fullNode,
        ContractType.ExchangeCreateContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function injectExchangeTokens(
    fullNode: HttpProvider,
    exchangeID: number,
    tokenName: string,
    tokenAmount: number,
    ownerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<ExchangeInjectContract>> {
    validator.notValid([
        { name: 'owner', type: 'address', value: ownerAddress as string },
        { name: 'token name', type: 'not-empty-string', value: tokenName },
        { name: 'token amount', type: 'integer', value: tokenAmount, gte: 1 },
        { name: 'exchangeID', type: 'integer', value: exchangeID, gte: 0 },
    ]);

    const data: ExchangeInjectContract = {
        owner_address: toHex(ownerAddress as string),
        exchange_id: parseInt(exchangeID),
        token_id: fromUtf8(tokenName),
        quant: parseInt(tokenAmount),
    };

    return createTransaction(
        fullNode,
        ContractType.ExchangeInjectContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function withdrawExchangeTokens(
    fullNode: HttpProvider,
    exchangeID: number,
    tokenName: string,
    tokenAmount: number,
    ownerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<ExchangeWithdrawContract>> {
    validator.notValid([
        { name: 'owner', type: 'address', value: ownerAddress as string },
        { name: 'token name', type: 'not-empty-string', value: tokenName },
        { name: 'token amount', type: 'integer', value: tokenAmount, gte: 1 },
        { name: 'exchangeID', type: 'integer', value: exchangeID, gte: 0 },
    ]);

    const data: ExchangeWithdrawContract = {
        owner_address: toHex(ownerAddress as string),
        exchange_id: parseInt(exchangeID),
        token_id: fromUtf8(tokenName),
        quant: parseInt(tokenAmount),
    };

    return createTransaction<ExchangeWithdrawContract>(
        fullNode,
        ContractType.ExchangeWithdrawContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function tradeExchangeTokens(
    fullNode: HttpProvider,
    exchangeID: number,
    tokenName: string,
    tokenAmountSold: number,
    tokenAmountExpected: number,
    ownerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<ExchangeTransactionContract>> {
    validator.notValid([
        { name: 'owner', type: 'address', value: ownerAddress as string },
        { name: 'token name', type: 'not-empty-string', value: tokenName },
        { name: 'tokenAmountSold', type: 'integer', value: tokenAmountSold, gte: 1 },
        { name: 'tokenAmountExpected', type: 'integer', value: tokenAmountExpected, gte: 1 },
        { name: 'exchangeID', type: 'integer', value: exchangeID, gte: 0 },
    ]);

    const data: ExchangeTransactionContract = {
        owner_address: toHex(ownerAddress as string),
        exchange_id: parseInt(exchangeID),
        token_id: TronWeb.fromAscii(tokenName).replace(/^0x/, ''),
        quant: parseInt(tokenAmountSold),
        expected: parseInt(tokenAmountExpected),
    };

    return createTransaction<ExchangeTransactionContract>(
        fullNode,
        ContractType.ExchangeTransactionContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function updateSetting(
    fullNode: HttpProvider,
    contractAddress: string,
    userFeePercentage: number,
    ownerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<UpdateSettingContract>> {
    validator.notValid([
        { name: 'owner', type: 'address', value: ownerAddress as string },
        { name: 'contract', type: 'address', value: contractAddress },
        { name: 'userFeePercentage', type: 'integer', value: userFeePercentage, gte: 0, lte: 100 },
    ]);

    const data: UpdateSettingContract = {
        owner_address: toHex(ownerAddress as string),
        contract_address: toHex(contractAddress),
        consume_user_resource_percent: userFeePercentage,
    };

    return createTransaction<UpdateSettingContract>(
        fullNode,
        ContractType.UpdateSettingContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

export async function updateEnergyLimit(
    fullNode: HttpProvider,
    contractAddress: string,
    originEnergyLimit: number,
    ownerAddress: string,
    options: TransactionCommonOptions = {}
): Promise<Transaction<UpdateEnergyLimitContract>> {
    validator.notValid([
        { name: 'owner', type: 'address', value: ownerAddress as string },
        { name: 'contract', type: 'address', value: contractAddress },
        { name: 'originEnergyLimit', type: 'integer', value: originEnergyLimit, gte: 0, lte: 10_000_000 },
    ]);

    const data: UpdateEnergyLimitContract = {
        owner_address: toHex(ownerAddress as string),
        contract_address: toHex(contractAddress),
        origin_energy_limit: originEnergyLimit,
    };

    return createTransaction<UpdateEnergyLimitContract>(
        fullNode,
        ContractType.UpdateEnergyLimitContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

function checkPermissions(permissions: Permission, type: number) {
    if (permissions) {
        if (
            permissions.type !== type ||
            !permissions.permission_name ||
            !isString(permissions.permission_name) ||
            !isInteger(permissions.threshold) ||
            permissions.threshold < 1 ||
            !permissions.keys
        ) {
            return false;
        }
        for (const key of permissions.keys) {
            if (
                !TronWeb.isAddress(key.address) ||
                !isInteger(key.weight) ||
                key.weight < 1 ||
                (type === 2 && !permissions.operations)
            ) {
                return false;
            }
        }
    }
    return true;
}

export async function updateAccountPermissions(
    fullNode: HttpProvider,
    ownerAddress: string,
    ownerPermission: Permission,
    witnessPermission: Permission | undefined | null,
    activesPermissions: Permission | Permission[],
    options: TransactionCommonOptions = {}
): Promise<Transaction<AccountPermissionUpdateContract>> {
    if (!TronWeb.isAddress(ownerAddress as Address)) throw new Error('Invalid ownerAddress provided');

    if (!checkPermissions(ownerPermission, 0)) {
        throw new Error('Invalid ownerPermissions provided');
    }

    if (!checkPermissions(witnessPermission!, 1)) {
        throw new Error('Invalid witnessPermissions provided');
    }

    if (!Array.isArray(activesPermissions)) {
        activesPermissions = [activesPermissions];
    }

    for (const activesPermission of activesPermissions) {
        if (!checkPermissions(activesPermission, 2)) {
            throw new Error('Invalid activesPermissions provided');
        }
    }

    const data: AccountPermissionUpdateContract = {
        owner_address: toHex(ownerAddress as string),
    };
    if (ownerPermission) {
        const _ownerPermissions = deepCopyJson<Partial<Permission>>(ownerPermission);
        if ('type' in _ownerPermissions) {
            delete _ownerPermissions.type;
        }
        _ownerPermissions.keys = _ownerPermissions.keys?.map(({ address, weight }) => ({
            address: toHex(address),
            weight,
        }));
        data.owner = _ownerPermissions as Permission;
    }
    if (witnessPermission) {
        const _witnessPermissions = deepCopyJson<Permission>(witnessPermission);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        _witnessPermissions.type = 'Witness';
        _witnessPermissions.keys = _witnessPermissions.keys.map(({ address, weight }) => ({
            address: toHex(address),
            weight,
        }));
        data.witness = _witnessPermissions;
    }
    if (activesPermissions) {
        const _activesPermissions = deepCopyJson<Permission[]>(activesPermissions);
        _activesPermissions.forEach((activePermissions: Permission) => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            activePermissions.type = 'Active';
        });
        _activesPermissions.forEach((_activesPermission) => {
            _activesPermission.keys = _activesPermission.keys.map(({ address, weight }) => ({
                address: toHex(address),
                weight,
            }));
        });
        data.actives = _activesPermissions as Permission[];
    }

    return createTransaction<AccountPermissionUpdateContract>(
        fullNode,
        ContractType.AccountPermissionUpdateContract,
        data,
        options?.permissionId,
        getTransactionOptions(options)
    );
}

// ---------- transformations ----------

export async function newTxID<T extends ContractParamter, U extends SignedTransaction<T> | Transaction<T>>(
    fullNode: HttpProvider,
    transaction: U,
    options: { txLocal?: boolean } = {}
): Promise<U> {
    if (options?.txLocal) {
        const contract = transaction.raw_data.contract[0];
        try {
            const tx = await createTransaction<T>(
                fullNode,
                contract.type,
                contract.parameter.value,
                contract.Permission_id,
                {
                    fee_limit: transaction.raw_data.fee_limit,
                    data: transaction.raw_data.data,
                    ref_block_bytes: transaction.raw_data.ref_block_bytes,
                    ref_block_hash: transaction.raw_data.ref_block_hash,
                    expiration: transaction.raw_data.expiration,
                    timestamp: transaction.raw_data.timestamp,
                }
            );
            (tx as SignedTransaction<T>).signature = (transaction as SignedTransaction<T>).signature;
            tx.visible = transaction.visible;
            return tx as U;
        } catch (e) {
            throw new Error('Error generating a new transaction id.');
        }
    }
    try {
        const res: GetSignWeightResponse = await fullNode.request('wallet/getsignweight', transaction, 'post');
        if (typeof transaction.visible === 'boolean') {
            res.transaction.transaction.visible = transaction.visible;
        }
        return resultManager(
            res.transaction.transaction as unknown as TransactionWrapper,
            {
                ...transaction.raw_data.contract[0].parameter.value,
                Permission_id: transaction.raw_data.contract[0].Permission_id,
            },
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            /* @ts-ignore */
            { data: transaction.raw_data.data, fee_limit: transaction.raw_data.fee_limit }
        ) as unknown as U;
    } catch (e) {
        throw new Error('Error generating a new transaction id.');
    }
}

export async function alterTransaction<T extends Transaction>(
    fullNode: HttpProvider,
    transaction: T,
    options: AlterTransactionOptions = {}
) {
    if (Reflect.has(transaction, 'signature')) throw new Error('You can not extend the expiration of a signed transaction.');

    if (options.data) {
        if (options.dataFormat !== 'hex' && !/^0x/.test(options.data)) options.data = TronWeb.fromUtf8(options.data);
        if (!isHex(options.data)) throw new Error('Invalid data provided');
        options.data = options.data.replace(/^0x/, '');
        options.data = options.data.padStart(Math.ceil(options.data.length / 2) * 2, '0');
        if (options.data.length === 0) throw new Error('Invalid data provided');
        transaction.raw_data.data = options.data;
    }

    if (options.extension) {
        options.extension = parseInt(options.extension * 1000);
        if (isNaN(options.extension) || transaction.raw_data.expiration + options.extension <= Date.now() + 3000)
            throw new Error('Invalid extension provided');
        transaction.raw_data.expiration += options.extension;
    }

    return await newTxID(fullNode, transaction, { txLocal: options.txLocal });
}

export async function extendExpiration<T extends Transaction>(
    fullNode: HttpProvider,
    transaction: T,
    extension: number,
    options: TxLocal = {}
) {
    return await alterTransaction(fullNode, transaction, { extension, txLocal: options?.txLocal });
}

export async function addUpdateData<T extends Transaction>(
    fullNode: HttpProvider,
    transaction: T,
    data: string,
    dataFormat: 'utf8' | 'hex' = 'utf8',
    options: TxLocal = {}
) {
    return alterTransaction(fullNode, transaction, { data, dataFormat: dataFormat as string, txLocal: options?.txLocal });
}
