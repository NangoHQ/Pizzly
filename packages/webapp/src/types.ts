export interface ActivityResponse {
    level: 'info' | 'debug' | 'error';
    action: 'oauth' | 'proxy' | 'token';
    success: boolean;
    timestamp: string;
    start: string;
    end: string;
    message: string;
    messages: {
        [index: string]: undefined | string | number;
    }[];
    connectionId: string;
    providerConfigKey: string;
    provider: string;
    method: string;
    endpoint?: string;
}
