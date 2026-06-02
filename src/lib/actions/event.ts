import { TronWeb } from '../../tronweb.js';
import type { HttpProvider } from '../providers/index.js';
import { isInteger } from '../../utils/validations.js';
import { fromHex } from '../../utils/address.js';
import type { EventResponse, GetEventResultOptions } from '../../types/Event.js';

export async function getEventsByContractAddress(
    eventServer: HttpProvider,
    contractAddress: string,
    options: GetEventResultOptions = {}
) {
    const newOptions = Object.assign({ limit: 20 }, options);
    const {
        eventName,
        blockNumber,
        onlyUnconfirmed,
        onlyConfirmed,
        minBlockTimestamp,
        maxBlockTimestamp,
        orderBy,
        fingerprint,
    } = newOptions;
    let { limit } = newOptions;

    if (!TronWeb.isAddress(contractAddress)) {
        throw new Error('Invalid contract address provided');
    }

    if (typeof minBlockTimestamp !== 'undefined' && !isInteger(minBlockTimestamp)) {
        throw new Error('Invalid minBlockTimestamp provided');
    }

    if (typeof maxBlockTimestamp !== 'undefined' && !isInteger(maxBlockTimestamp)) {
        throw new Error('Invalid maxBlockTimestamp provided');
    }

    if (isInteger(limit) && limit > 200) {
        console.warn('Defaulting to maximum accepted limit: 200');
        limit = 200;
    }

    const qs = {} as any;

    if (eventName) qs.event_name = eventName;
    if (blockNumber) qs.block_number = blockNumber;
    if (typeof onlyUnconfirmed === 'boolean') qs.only_unconfirmed = onlyUnconfirmed;
    if (typeof onlyConfirmed === 'boolean') qs.only_confirmed = onlyConfirmed;
    if (minBlockTimestamp) qs.min_block_timestamp = minBlockTimestamp;
    if (maxBlockTimestamp) qs.max_block_timestamp = maxBlockTimestamp;
    if (orderBy) qs.order_by = orderBy;
    if (fingerprint) qs.fingerprint = fingerprint;
    if (isInteger(limit)) qs.limit = limit;

    const res = await eventServer.request<EventResponse>(
        `v1/contracts/${fromHex(contractAddress)}/events?${new URLSearchParams(qs).toString()}`
    );
    if (res.success) {
        return res;
    }
    throw new Error(res.error);
}

export async function getEventsByTransactionID(
    eventServer: HttpProvider,
    transactionID: string,
    options: {
        only_unconfirmed?: boolean;
        only_confirmed?: boolean;
    } = {}
) {
    if (!/^[0-9a-fA-F]{64}$/.test(transactionID)) {
        throw new Error('Invalid transactionID provided');
    }

    const qs = {} as any;
    if (typeof options.only_unconfirmed === 'boolean') qs.only_unconfirmed = options.only_unconfirmed;
    if (typeof options.only_confirmed === 'boolean') qs.only_confirmed = options.only_confirmed;

    return eventServer
        .request<EventResponse>(`v1/transactions/${transactionID}/events?${new URLSearchParams(qs).toString()}`)
        .then((res) => {
            if (res.success) {
                return res;
            }
            throw new Error(JSON.parse(res.error!).message);
        });
}

export async function getEventsByBlockNumber(
    eventServer: HttpProvider,
    blockNumber: number | string,
    options: {
        only_confirmed?: boolean;
        limit?: number;
        fingerprint?: string;
    } = {}
) {
    const qs = {} as any;
    if (typeof options.only_confirmed === 'boolean') qs.only_confirmed = options.only_confirmed;
    if (options.limit) qs.limit = options.limit;
    if (options.fingerprint) qs.fingerprint = options.fingerprint;

    return eventServer
        .request<EventResponse>(`v1/blocks/${encodeURIComponent(String(blockNumber))}/events?${new URLSearchParams(qs).toString()}`)
        .then((res) => {
            if (res.success) {
                return res;
            }
            throw new Error(res.error);
        });
}

export async function getEventsOfLatestBlock(
    eventServer: HttpProvider,
    options: { only_confirmed?: boolean } = {}
) {
    const qs = {} as any;
    if (typeof options.only_confirmed === 'boolean') qs.only_confirmed = options.only_confirmed;

    return eventServer
        .request<EventResponse>(`v1/blocks/latest/events?${new URLSearchParams(qs).toString()}`)
        .then((res) => {
            if (res.success) {
                return res;
            }
            throw new Error(res.error);
        });
}
