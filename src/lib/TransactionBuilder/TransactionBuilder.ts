import { TronWeb } from '../../tronweb.js';
import { CreateSmartContractTransaction, SignedTransaction, Transaction, TransactionWrapper } from '../../types/Transaction.js';
import {
    AccountCreateContract,
    AccountPermissionUpdateContract,
    AccountUpdateContract,
    AssetIssueContract,
    CancelFreezeBalanceV2Contract,
    ClearABIContract,
    ContractParamter,
    DelegateResourceContract,
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

import * as actions from '../actions/transactionBuilder.js';

export class TransactionBuilder {
    private tronWeb: TronWeb;
    constructor(tronWeb?: TronWeb) {
        if (!tronWeb || !(tronWeb instanceof TronWeb)) {
            throw new Error('Expected instance of TronWeb');
        }
        this.tronWeb = tronWeb;
    }

    async sendTrx(
        to: string,
        amount = 0,
        from: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<TransferContract>> {
        return actions.sendTrx(this.tronWeb.fullNode, to, amount, from, options);
    }

    async sendToken(
        to: string,
        amount = 0,
        tokenId: string,
        from: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<TransferAssetContract>> {
        return actions.sendToken(this.tronWeb.fullNode, to, amount, tokenId, from, options);
    }

    async purchaseToken(
        issuerAddress: string,
        tokenId: string,
        amount = 0,
        buyer: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<ParticipateAssetIssueContract>> {
        return actions.purchaseToken(this.tronWeb.fullNode, issuerAddress, tokenId, amount, buyer, options);
    }

    async freezeBalance(
        amount = 0,
        duration = 3,
        resource: Resource = 'BANDWIDTH',
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        receiverAddress?: string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<FreezeBalanceContract>> {
        return actions.freezeBalance(this.tronWeb.fullNode, amount, duration, resource, ownerAddress, receiverAddress, options);
    }

    async unfreezeBalance(
        resource: Resource = 'BANDWIDTH',
        address: string = this.tronWeb.defaultAddress.hex as string,
        receiverAddress?: string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<UnfreezeBalanceContract>> {
        return actions.unfreezeBalance(this.tronWeb.fullNode, resource, address, receiverAddress, options);
    }

    async freezeBalanceV2(
        amount = 0,
        resource: Resource = 'BANDWIDTH',
        address: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<FreezeBalanceV2Contract>> {
        return actions.freezeBalanceV2(this.tronWeb.fullNode, amount, resource, address, options);
    }

    async unfreezeBalanceV2(
        amount = 0,
        resource: Resource = 'BANDWIDTH',
        address: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<UnfreezeBalanceV2Contract>> {
        return actions.unfreezeBalanceV2(this.tronWeb.fullNode, amount, resource, address, options);
    }

    async cancelUnfreezeBalanceV2(
        address: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<CancelFreezeBalanceV2Contract>> {
        return actions.cancelUnfreezeBalanceV2(this.tronWeb.fullNode, address, options);
    }

    async delegateResource(
        amount = 0,
        receiverAddress: string,
        resource: Resource = 'BANDWIDTH',
        address: string = this.tronWeb.defaultAddress.hex as string,
        lock = false,
        lockPeriod?: number,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<DelegateResourceContract>> {
        return actions.delegateResource(this.tronWeb.fullNode, amount, receiverAddress, resource, address, lock, lockPeriod, options);
    }

    async undelegateResource(
        amount = 0,
        receiverAddress: string,
        resource: Resource = 'BANDWIDTH',
        address: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<UnDelegateResourceContract>> {
        return actions.undelegateResource(this.tronWeb.fullNode, amount, receiverAddress, resource, address, options);
    }

    async withdrawExpireUnfreeze(
        address: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<WithdrawExpireUnfreezeContract>> {
        return actions.withdrawExpireUnfreeze(this.tronWeb.fullNode, address, options);
    }

    async withdrawBlockRewards(
        address: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<WithdrawBalanceContract>> {
        return actions.withdrawBlockRewards(this.tronWeb.fullNode, address, options);
    }

    async applyForSR(
        address: string = this.tronWeb.defaultAddress.hex as string,
        url = '',
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<WitnessCreateContract>> {
        return actions.applyForSR(this.tronWeb.fullNode, address, url, options);
    }

    async vote(
        votes: VoteInfo = {},
        voterAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<VoteWitnessContract>> {
        return actions.vote(this.tronWeb.fullNode, votes, voterAddress, options);
    }

    async createSmartContract(
        options: CreateSmartContractOptions = {} as CreateSmartContractOptions,
        issuerAddress: string = this.tronWeb.defaultAddress.hex as string
    ): Promise<CreateSmartContractTransaction> {
        return actions.createSmartContract(
            this.tronWeb.fullNode,
            { feeLimit: this.tronWeb.feeLimit, ...options },
            issuerAddress
        );
    }

    async triggerSmartContract(
        contractAddress: string,
        functionSelector: string,
        options?: TriggerSmartContractOptions,
        parameters?: ContractFunctionParameter[],
        issuerAddress?: string
    ): Promise<TransactionWrapper> {
        let resolvedOptions: TriggerSmartContractOptions;
        let resolvedParameters: ContractFunctionParameter[];
        let resolvedIssuer: string;
        if (typeof options !== 'object') {
            // Legacy positional form:
            //   triggerSmartContract(addr, selector, feeLimit, callValue, parametersArray)
            // The numeric 3rd/4th args are feeLimit/callValue; the 5th positional arg
            // (received here via `issuerAddress`) is the parameters array, and the issuer
            // defaults — matching pre-refactor behavior.
            resolvedOptions = {
                feeLimit: options as unknown as number,
                callValue: parameters as unknown as number,
            };
            resolvedParameters = (issuerAddress as unknown as ContractFunctionParameter[] | undefined) ?? [];
            resolvedIssuer = this.tronWeb.defaultAddress.hex as string;
        } else {
            resolvedOptions = options ?? {};
            resolvedParameters = parameters ?? [];
            resolvedIssuer = (issuerAddress ?? this.tronWeb.defaultAddress.hex) as string;
        }
        return actions.triggerSmartContract(
            this.tronWeb.fullNode,
            this.tronWeb.solidityNode,
            contractAddress,
            functionSelector,
            { feeLimit: this.tronWeb.feeLimit, ...resolvedOptions },
            resolvedParameters,
            resolvedIssuer
        );
    }

    async triggerConstantContract(
        contractAddress: string,
        functionSelector: string,
        options: TriggerConstantContractOptions = {},
        parameters: ContractFunctionParameter[] = [],
        issuerAddress: string = this.tronWeb.defaultAddress.hex as string
    ): Promise<TransactionWrapper> {
        return actions.triggerConstantContract(
            this.tronWeb.fullNode,
            this.tronWeb.solidityNode,
            contractAddress,
            functionSelector,
            { feeLimit: this.tronWeb.feeLimit, ...options },
            parameters,
            issuerAddress
        );
    }

    async triggerConfirmedConstantContract(
        contractAddress: string,
        functionSelector: string,
        options: TriggerConstantContractOptions = {},
        parameters: ContractFunctionParameter[] = [],
        issuerAddress: string = this.tronWeb.defaultAddress.hex as string
    ): Promise<TransactionWrapper> {
        return actions.triggerConfirmedConstantContract(
            this.tronWeb.fullNode,
            this.tronWeb.solidityNode,
            contractAddress,
            functionSelector,
            { feeLimit: this.tronWeb.feeLimit, ...options },
            parameters,
            issuerAddress
        );
    }

    async estimateEnergy(
        contractAddress: string,
        functionSelector: string,
        options: TriggerConstantContractOptions = {},
        parameters: ContractFunctionParameter[] = [],
        issuerAddress: string = this.tronWeb.defaultAddress.hex as string
    ): Promise<{ result: { result: boolean }; energy_required: number }> {
        return actions.estimateEnergy(
            this.tronWeb.fullNode,
            this.tronWeb.solidityNode,
            contractAddress,
            functionSelector,
            { feeLimit: this.tronWeb.feeLimit, ...options },
            parameters,
            issuerAddress
        );
    }

    async deployConstantContract(options: DeployConstantContractOptions = { input: '', ownerAddress: '' }) {
        return actions.deployConstantContract(this.tronWeb.fullNode, this.tronWeb.solidityNode, options);
    }

    async clearABI(
        contractAddress: string,
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<ClearABIContract>> {
        return actions.clearABI(this.tronWeb.fullNode, this.tronWeb.trx.cache, contractAddress, ownerAddress, options);
    }

    async updateBrokerage(
        brokerage: number,
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<UpdateBrokerageContract>> {
        return actions.updateBrokerage(this.tronWeb.fullNode, brokerage, ownerAddress, options);
    }

    async createToken(
        options: CreateTokenOptions = {} as CreateTokenOptions,
        issuerAddress: string = this.tronWeb.defaultAddress.hex as string
    ): Promise<Transaction<AssetIssueContract>> {
        return actions.createToken(this.tronWeb.fullNode, options, issuerAddress);
    }

    async createAccount(
        accountAddress: string,
        address: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<AccountCreateContract>> {
        return actions.createAccount(this.tronWeb.fullNode, accountAddress, address, options);
    }

    async updateAccount(
        accountName: string,
        address: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<AccountUpdateContract>> {
        return actions.updateAccount(this.tronWeb.fullNode, accountName, address, options);
    }

    async setAccountId(
        accountId: string,
        address: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<SetAccountIdContract>> {
        return actions.setAccountId(this.tronWeb.fullNode, accountId, address, options);
    }

    async updateToken(
        options: UpdateTokenOptions = {} as UpdateTokenOptions,
        issuerAddress: string = this.tronWeb.defaultAddress.hex as string
    ): Promise<Transaction<UpdateAssetContract>> {
        return actions.updateToken(this.tronWeb.fullNode, options, issuerAddress);
    }

    async sendAsset(
        to: string,
        amount = 0,
        tokenId: string,
        from: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ) {
        return this.sendToken(to, amount, tokenId, from, options);
    }

    async purchaseAsset(
        issuerAddress: string,
        tokenId: string,
        amount = 0,
        buyer: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ) {
        return this.purchaseToken(issuerAddress, tokenId, amount, buyer, options);
    }

    async createAsset(options: CreateTokenOptions, issuerAddress: string) {
        return this.createToken(options, issuerAddress);
    }

    async updateAsset(
        options: UpdateTokenOptions = {} as UpdateTokenOptions,
        issuerAddress: string = this.tronWeb.defaultAddress.hex as string
    ) {
        return this.updateToken(options, issuerAddress);
    }

    async createProposal(
        parameters: Record<string, string | number> | Record<string, string | number>[],
        issuerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<ProposalCreateContract>> {
        return actions.createProposal(this.tronWeb.fullNode, parameters, issuerAddress, options);
    }

    async deleteProposal(
        proposalID: number,
        issuerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<ProposalDeleteContract>> {
        return actions.deleteProposal(this.tronWeb.fullNode, proposalID, issuerAddress, options);
    }

    async voteProposal(
        proposalID: number,
        isApproval = false,
        voterAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<VoteProposalContract>> {
        return actions.voteProposal(this.tronWeb.fullNode, proposalID, isApproval, voterAddress, options);
    }

    async createTRXExchange(
        tokenName: string,
        tokenBalance: number,
        trxBalance: number,
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<ExchangeCreateContract>> {
        return actions.createTRXExchange(this.tronWeb.fullNode, tokenName, tokenBalance, trxBalance, ownerAddress, options);
    }

    async createTokenExchange(
        firstTokenName: string,
        firstTokenBalance: number,
        secondTokenName: string,
        secondTokenBalance: number,
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<ExchangeCreateContract>> {
        return actions.createTokenExchange(this.tronWeb.fullNode, firstTokenName, firstTokenBalance, secondTokenName, secondTokenBalance, ownerAddress, options);
    }

    async injectExchangeTokens(
        exchangeID: number,
        tokenName: string,
        tokenAmount: number,
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<ExchangeInjectContract>> {
        return actions.injectExchangeTokens(this.tronWeb.fullNode, exchangeID, tokenName, tokenAmount, ownerAddress, options);
    }

    async withdrawExchangeTokens(
        exchangeID: number,
        tokenName: string,
        tokenAmount: number,
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<ExchangeWithdrawContract>> {
        return actions.withdrawExchangeTokens(this.tronWeb.fullNode, exchangeID, tokenName, tokenAmount, ownerAddress, options);
    }

    async tradeExchangeTokens(
        exchangeID: number,
        tokenName: string,
        tokenAmountSold: number,
        tokenAmountExpected: number,
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<ExchangeTransactionContract>> {
        return actions.tradeExchangeTokens(this.tronWeb.fullNode, exchangeID, tokenName, tokenAmountSold, tokenAmountExpected, ownerAddress, options);
    }

    async updateSetting(
        contractAddress: string,
        userFeePercentage: number,
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<UpdateSettingContract>> {
        return actions.updateSetting(this.tronWeb.fullNode, contractAddress, userFeePercentage, ownerAddress, options);
    }

    async updateEnergyLimit(
        contractAddress: string,
        originEnergyLimit = 0,
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<UpdateEnergyLimitContract>> {
        return actions.updateEnergyLimit(this.tronWeb.fullNode, contractAddress, originEnergyLimit, ownerAddress, options);
    }

    async updateAccountPermissions(
        ownerAddress: string = this.tronWeb.defaultAddress.hex as string,
        ownerPermission: Permission,
        witnessPermission: Permission | undefined | null,
        activesPermissions: Permission | Permission[],
        options: TransactionCommonOptions = {}
    ): Promise<Transaction<AccountPermissionUpdateContract>> {
        return actions.updateAccountPermissions(this.tronWeb.fullNode, ownerAddress, ownerPermission, witnessPermission, activesPermissions, options);
    }

    async newTxID<T extends ContractParamter, U extends SignedTransaction<T> | Transaction<T>>(
        transaction: U,
        options: { txLocal?: boolean } = {}
    ): Promise<U> {
        return actions.newTxID<T, U>(this.tronWeb.fullNode, transaction, options);
    }

    async alterTransaction<T extends Transaction>(transaction: T, options: AlterTransactionOptions = {}) {
        return actions.alterTransaction<T>(this.tronWeb.fullNode, transaction, options);
    }

    async extendExpiration<T extends Transaction>(transaction: T, extension: number, options: TxLocal = {}) {
        return actions.extendExpiration<T>(this.tronWeb.fullNode, transaction, extension, options);
    }

    async addUpdateData<T extends Transaction>(transaction: T, data: string, dataFormat: 'utf8' | 'hex' = 'utf8', options: TxLocal = {}) {
        return actions.addUpdateData<T>(this.tronWeb.fullNode, transaction, data, dataFormat, options);
    }
}
