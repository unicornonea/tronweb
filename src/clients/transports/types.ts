import type { HeadersType } from '../../types/Providers.js';

export interface HttpTransportOptions {
    headers?: HeadersType;
    timeout?: number;
}

export interface HttpTransport extends HttpTransportOptions {
    readonly type: 'http';
    readonly url?: string;
}

export type Transport = HttpTransport;