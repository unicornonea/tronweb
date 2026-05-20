import { Contract } from '../lib/contract/index.js';
import type { ContractAbiInterface, FunctionFragment, GetOnMethodTypeFromAbi } from '../types/ABI.js';
import type { PublicClient, WalletClient } from './types.js';

// ─── Helper types ────────────────────────────────────────────────────────────

/** True if the fragment is a view or pure function (read-only, no state change) */
type IsReadOnly<F> = F extends FunctionFragment
    ? F['stateMutability'] extends 'view' | 'pure'
        ? true
        : F['constant'] extends true
            ? true
            : false
    : false;

/** Extract the return type of the `.call()` method from an `onMethod` function */
type CallReturnOf<F> = F extends (...args: any[]) => { call: infer C }
    ? C extends (...args: any[]) => infer R
        ? R
        : Promise<any>
    : Promise<any>;

/**
 * For each ABI function:
 * - view/pure → (...args) => CallReturnOf (direct result)
 * - non-view/pure → (...args) => Promise<string> (txID, requires WalletClient)
 */
type WrappedMethod<OnMethodFn, Fragment> = OnMethodFn extends (...args: infer A) => any
    ? IsReadOnly<Fragment> extends true
        ? (...args: A) => CallReturnOf<OnMethodFn>
        : (...args: A) => Promise<string>
    : (...args: any[]) => Promise<any>;

type OnMethods<Abi extends ContractAbiInterface> = GetOnMethodTypeFromAbi<Abi>;

/**
 * The result type of `createContract` — every ABI function mapped to a
 * directly-callable async function (no `.call()` / `.send()` needed).
 */
export type ContractFunctions<Abi extends ContractAbiInterface> = {
    [K in keyof OnMethods<Abi>]: Abi extends readonly (infer F)[]
        ? F extends FunctionFragment
            ? F['name'] extends K
                ? WrappedMethod<OnMethods<Abi>[K], F>
                : WrappedMethod<OnMethods<Abi>[K], never>
            : WrappedMethod<OnMethods<Abi>[K], never>
        : WrappedMethod<OnMethods<Abi>[K], never>;
};

// ─── Runtime ─────────────────────────────────────────────────────────────────

function isReadOnly(fragment: FunctionFragment): boolean {
    const sm = (fragment.stateMutability ?? '').toLowerCase();
    if (sm === 'view' || sm === 'pure') return true;
    // Legacy ABI format uses `constant: true` for view/pure
    if (fragment.constant === true) return true;
    return false;
}

function isWalletClient(client: PublicClient | WalletClient): client is WalletClient {
    return 'account' in client && typeof (client as WalletClient).sendTransaction === 'function';
}

/**
 * Create a type-safe contract wrapper.
 *
 * - `view`/`pure` methods are called with `.call()` automatically, returning the result directly.
 * - State-changing methods are built, signed with `client.account`, and broadcast, returning the txID.
 *
 * @param params.client   - A PublicClient (for read-only) or WalletClient (for read-write)
 * @param params.abi      - The contract ABI (use `as const` for full type inference)
 * @param params.address  - The contract address in base58Check format
 *
 * @example
 * ```ts
 * const contract = createContract({ client: walletClient, abi: MyABI, address: 'TXx...' });
 *
 * // view/pure method → returns result directly
 * const balance = await contract.balanceOf('TXx...');
 *
 * // state-changing method → signs and broadcasts, returns txID
 * const txId = await contract.transfer('TXx...', 1000n);
 * ```
 */
export function createContract<Abi extends ContractAbiInterface>({
    client,
    abi,
    address,
}: {
    client: PublicClient | WalletClient;
    abi: Abi;
    address: string;
}): ContractFunctions<Abi> {
    const tronWeb = client._tronWeb;
    const contract = new Contract(tronWeb, abi, address);

    // Build a map of method-name → stateMutability for fast runtime lookup
    const abiMap = new Map<string, FunctionFragment>();
    for (const fragment of abi) {
        if (fragment.type === 'function' && 'name' in fragment) {
            abiMap.set(fragment.name, fragment as FunctionFragment);
        }
    }

    const result: Record<string, (...args: any[]) => Promise<any>> = {};

    for (const [name, onMethodFn] of Object.entries(contract.methods)) {
        const fragment = abiMap.get(name);
        const readOnly = fragment ? isReadOnly(fragment) : false;

        if (readOnly) {
            // view / pure → call directly, return result
            result[name] = async (...args: any[]) => {
                return (onMethodFn as any)(...args).call();
            };
        } else {
            // state-changing → sign and broadcast
            result[name] = async (...args: any[]) => {
                if (!isWalletClient(client)) {
                    throw new Error(
                        `Method "${name}" modifies state and requires a WalletClient. Use createWalletClient() instead of createPublicClient().`
                    );
                }

                const { account } = client;
                const fromHex = tronWeb.address.toHex(account.address);

                if (!fragment) {
                    throw new Error(`ABI fragment not found for method "${name}"`);
                }

                // Encode the call parameters using the existing Method machinery
                const methodInstance = contract.methodInstances[name];
                if (!methodInstance || !methodInstance.functionSelector) {
                    throw new Error(`Method instance not found for "${name}"`);
                }

                const { encodeParamsV2ByABI } = await import('../utils/abi.js');
                const rawParameter = encodeParamsV2ByABI(fragment, args);

                const txWrapper = await tronWeb.transactionBuilder.triggerSmartContract(
                    address,
                    methodInstance.functionSelector,
                    {
                        feeLimit: tronWeb.feeLimit,
                        callValue: 0,
                        rawParameter,
                        from: fromHex,
                    } as any,
                    [],
                    fromHex
                );

                if (!txWrapper.result?.result) {
                    throw new Error(
                        'Failed to build transaction: ' +
                            (txWrapper.result?.message ?? JSON.stringify(txWrapper))
                    );
                }

                const signed = await account.signTransaction(txWrapper.transaction);
                const broadcast = await tronWeb.trx.sendRawTransaction(signed);

                if ((broadcast as any).code) {
                    const msg = (broadcast as any).message
                        ? tronWeb.toUtf8((broadcast as any).message)
                        : (broadcast as any).code;
                    throw new Error(msg);
                }

                return signed.txID;
            };
        }
    }

    return result as unknown as ContractFunctions<Abi>;
}
