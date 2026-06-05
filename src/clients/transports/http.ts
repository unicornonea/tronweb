import type { HttpTransport, HttpTransportOptions } from './types.js';

export function http(url?: string, options: HttpTransportOptions = {}): HttpTransport {
    return {
        type: 'http',
        url,
        ...options,
    };
}