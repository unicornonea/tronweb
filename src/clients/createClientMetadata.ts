export type ClientType = 'publicClient' | 'walletClient';

interface CreateClientMetadataOptions {
    readonly key?: string;
    readonly name?: string;
    readonly defaultKey: string;
    readonly defaultName: string;
    readonly type: ClientType;
}

let clientUidCounter = 0;

function createClientUid(key: string, type: ClientType): string {
    clientUidCounter += 1;
    return `${key}-${type}-${clientUidCounter.toString(36)}`;
}

export function createClientMetadata(options: CreateClientMetadataOptions) {
    const key = options.key ?? options.defaultKey;
    const name = options.name ?? options.defaultName;

    return {
        key,
        name,
        type: options.type,
        uid: createClientUid(key, options.type),
    } as const;
}