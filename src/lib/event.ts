import { TronWeb } from '../tronweb.js';
import { NodeProvider } from '../types/TronWeb.js';
import utils from '../utils/index.js';
import { HttpProvider } from './providers/index.js';
import type { GetEventResultOptions } from '../types/Event.js';
import {
    getEventsByContractAddress as getEventsByContractAddressAction,
    getEventsByTransactionID as getEventsByTransactionIDAction,
    getEventsByBlockNumber as getEventsByBlockNumberAction,
    getEventsOfLatestBlock as getEventsOfLatestBlockAction,
} from './actions/event.js';

export class Event {
    private tronWeb: TronWeb;

    constructor(tronWeb: TronWeb) {
        if (!tronWeb || !(tronWeb instanceof TronWeb)) throw new Error('Expected instance of TronWeb');
        this.tronWeb = tronWeb;
    }

    setServer(eventServer: NodeProvider, healthcheck = 'healthcheck') {
        if (!eventServer) return (this.tronWeb.eventServer = undefined);

        if (utils.isString(eventServer)) eventServer = new HttpProvider(eventServer);

        if (!this.tronWeb.isValidProvider(eventServer)) throw new Error('Invalid event server provided');

        this.tronWeb.eventServer = eventServer;
        this.tronWeb.eventServer.isConnected = () =>
            this.tronWeb
                .eventServer!.request(healthcheck)
                .then(() => true)
                .catch(() => false);
    }

    async getEventsByContractAddress(contractAddress: string, options: GetEventResultOptions = {}) {
        if (!this.tronWeb.eventServer) throw new Error('No event server configured');
        return getEventsByContractAddressAction(this.tronWeb.eventServer, contractAddress, options);
    }

    async getEventsByTransactionID(
        transactionID: string,
        options: { only_unconfirmed?: boolean; only_confirmed?: boolean } = {}
    ) {
        if (!this.tronWeb.eventServer) throw new Error('No event server configured');
        return getEventsByTransactionIDAction(this.tronWeb.eventServer, transactionID, options);
    }

    async getEventsByBlockNumber(
        blockNumber: number | string,
        options: { only_confirmed?: boolean; limit?: number; fingerprint?: string } = {}
    ) {
        if (!this.tronWeb.eventServer) throw new Error('No event server configured');
        return getEventsByBlockNumberAction(this.tronWeb.eventServer, blockNumber, options);
    }

    async getEventsOfLatestBlock(options: { only_confirmed?: boolean } = {}) {
        if (!this.tronWeb.eventServer) throw new Error('No event server configured');
        return getEventsOfLatestBlockAction(this.tronWeb.eventServer, options);
    }
}
