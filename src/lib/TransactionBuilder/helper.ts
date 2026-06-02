import { TronWeb } from '../../tronweb.js';
import { Transaction } from '../../types/Transaction.js';
import { ContractParamter, ContractType } from '../../types/Contract.js';
import { createTransaction as createTransactionAction } from '../actions/transactionBuilder.js';

export {
    fromUtf8,
    deepCopyJson,
    genContractAddress,
    resultManager,
    resultManagerTriggerSmartContract,
    getTransactionOptions,
} from '../actions/transactionBuilder.js';

export async function createTransaction<T extends ContractParamter>(
    tronWeb: TronWeb,
    type: ContractType,
    value: T,
    Permission_id?: number,
    options = {} as Partial<Omit<Transaction['raw_data'], 'contract'>>
): Promise<Transaction<T>> {
    return createTransactionAction(tronWeb.fullNode, type, value, Permission_id, options);
}
