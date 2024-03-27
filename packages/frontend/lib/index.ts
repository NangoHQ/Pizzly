/*
 * Copyright (c) 2023 Nango, all rights reserved.
 */

const prodHost = 'https://api.nango.dev';
const debugLogPrefix = 'NANGO DEBUG LOG: ';

const enum WSMessageType {
    ConnectionAck = 'connection_ack',
    Error = 'error',
    Success = 'success'
}

export class AuthError extends Error {
    type: string;

    constructor(message: string, type: string) {
        super(message);
        this.type = type;
    }
}

export interface AuthResult {
    providerConfigKey: string;
    connectionId: string;
    isPending?: boolean;
}

interface AuthOptions {
    detectClosedAuthWindow?: boolean; // If true, `nango.auth()` would fail if the login window is closed before the authorization flow is completed
}

export default class Nango {
    private hostBaseUrl: string;
    private websocketsBaseUrl: string;
    private status: AuthorizationStatus;
    private publicKey: string;
    private debug = false;
    public win: null | AuthorizationModal = null;
    private width: number | null = null;
    private height: number | null = null;
    private tm: null | NodeJS.Timer = null;

    constructor(config: { host?: string; websocketsPath?: string; publicKey: string; width?: number; height?: number; debug?: boolean }) {
        config.host = config.host || prodHost; // Default to Nango Cloud.
        config.websocketsPath = config.websocketsPath || '/'; // Default to root path.
        this.debug = config.debug || false;

        if (this.debug) {
            console.log(debugLogPrefix, `Debug mode is enabled.`);
            console.log(debugLogPrefix, `Using host: ${config.host}.`);
        }

        if (config.width) {
            this.width = config.width;
        }

        if (config.height) {
            this.height = config.height;
        }

        this.hostBaseUrl = config.host.slice(-1) === '/' ? config.host.slice(0, -1) : config.host; // Remove trailing slash.
        this.status = AuthorizationStatus.IDLE;
        this.publicKey = config.publicKey;

        if (!config.publicKey) {
            throw new AuthError('You must specify a public key (cf. documentation).', 'missingPublicKey');
        }

        try {
            const baseUrl = new URL(this.hostBaseUrl);
            // Build the websockets url based on the host url.
            // The websockets path is considered relative to the baseUrl, and with the protocol updated
            const websocketUrl = new URL(config.websocketsPath, baseUrl);
            this.websocketsBaseUrl = websocketUrl.toString().replace('https://', 'wss://').replace('http://', 'ws://');
        } catch {
            throw new AuthError('Invalid URL provided for the Nango host.', 'invalidHostUrl');
        }
    }

    public async create(providerConfigKey: string, connectionId: string, connectionConfig?: ConnectionConfig): Promise<AuthResult> {
        const url = this.hostBaseUrl + `/unauth/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig)}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            const errorResponse = await res.json();
            throw new AuthError(errorResponse.error, errorResponse.type);
        }

        return res.json();
    }

    public auth(
        providerConfigKey: string,
        connectionId: string,
        options?: (ConnectionConfig | OAuthCredentialsOverride | BasicApiCredentials | ApiKeyCredentials | AppStoreCredentials) & AuthOptions
    ): Promise<AuthResult> {
        if (
            options &&
            'credentials' in options &&
            (!('oauth_client_id_override' in options.credentials) || !('oauth_client_secret_override' in options.credentials)) &&
            Object.keys(options.credentials).length > 0
        ) {
            const credentials = options.credentials as BasicApiCredentials | ApiKeyCredentials;
            const { credentials: _, ...connectionConfig } = options as ConnectionConfig;

            return this.customAuth(providerConfigKey, connectionId, this.convertCredentialsToConfig(credentials), connectionConfig);
        }

        const url = this.hostBaseUrl + `/oauth/connect/${providerConfigKey}${this.toQueryString(connectionId, options as ConnectionConfig)}`;

        try {
            new URL(url);
        } catch {
            throw new AuthError('Invalid URL provided for the Nango host.', 'invalidHostUrl');
        }

        return new Promise((resolve, reject) => {
            const successHandler = (providerConfigKey: string, connectionId: string, isPending = false) => {
                if (this.status !== AuthorizationStatus.BUSY) {
                    return;
                }

                this.status = AuthorizationStatus.DONE;

                return resolve({
                    providerConfigKey: providerConfigKey,
                    connectionId: connectionId,
                    isPending
                });
            };

            const errorHandler = (errorType: string, errorDesc: string) => {
                if (this.status !== AuthorizationStatus.BUSY) {
                    return;
                }

                this.status = AuthorizationStatus.DONE;

                const error = new AuthError(errorDesc, errorType);
                return reject(error);
            };

            if (this.status === AuthorizationStatus.BUSY) {
                const error = new AuthError('The authorization window is already opened', 'windowIsOppened');
                reject(error);
            }

            // Save authorization status (for handler)
            this.status = AuthorizationStatus.BUSY;

            // Open authorization modal
            this.win = new AuthorizationModal(
                this.websocketsBaseUrl,
                url,
                successHandler,
                errorHandler,
                { width: this.width, height: this.height },
                this.debug
            );
            if (options?.detectClosedAuthWindow || false) {
                this.tm = setInterval(() => {
                    if (!this.win?.modal?.window || this.win?.modal?.window.closed) {
                        if (this.win?.isProcessingMessage === true) {
                            // Modal is still processing a web socket message from the server
                            // We ignore the window being closed for now
                            return;
                        }
                        clearTimeout(this.tm as unknown as number);
                        this.win = null;
                        this.status = AuthorizationStatus.CANCELED;
                        const error = new AuthError('The authorization window was closed before the authorization flow was completed', 'windowClosed');
                        reject(error);
                    }
                }, 500);
            }
        });
    }

    private convertCredentialsToConfig(credentials: BasicApiCredentials | ApiKeyCredentials | AppStoreCredentials): ConnectionConfig {
        const params: Record<string, string> = {};

        if ('username' in credentials) {
            params['username'] = credentials.username || '';
        }
        if ('password' in credentials) {
            params['password'] = credentials.password || '';
        }
        if ('apiKey' in credentials) {
            params['apiKey'] = credentials.apiKey || '';
        }

        if ('privateKeyId' in credentials && 'issuerId' in credentials && 'privateKey' in credentials) {
            const appStoreCredentials: { params: Record<string, string | string[]> } = {
                params: {
                    privateKeyId: credentials.privateKeyId,
                    issuerId: credentials.issuerId,
                    privateKey: credentials.privateKey
                }
            };

            if (credentials.scope) {
                appStoreCredentials.params['scope'] = credentials.scope;
            }
            return appStoreCredentials as unknown as ConnectionConfig;
        }

        return { params };
    }

    private async customAuth(
        providerConfigKey: string,
        connectionId: string,
        connectionConfigWithCredentials: ConnectionConfig,
        connectionConfig?: ConnectionConfig
    ): Promise<AuthResult> {
        const { params: credentials } = connectionConfigWithCredentials;

        if (!credentials) {
            throw new AuthError('You must specify credentials.', 'missingCredentials');
        }

        if ('apiKey' in credentials) {
            const apiKeyCredential = credentials as ApiKeyCredentials;
            const url = this.hostBaseUrl + `/api-auth/api-key/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(apiKeyCredential)
            });

            if (!res.ok) {
                const errorResponse = await res.json();
                throw new AuthError(errorResponse.error, errorResponse.type);
            }

            return res.json();
        }

        if ('username' in credentials || 'password' in credentials) {
            const basicCredentials = credentials as BasicApiCredentials;

            const url = this.hostBaseUrl + `/api-auth/basic/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(basicCredentials)
            });

            if (!res.ok) {
                const errorResponse = await res.json();
                throw new AuthError(errorResponse.error, errorResponse.type);
            }

            return res.json();
        }

        if ('privateKeyId' in credentials && 'issuerId' in credentials && 'privateKey' in credentials) {
            const appCredentials = credentials as unknown as AppStoreCredentials;

            const url = this.hostBaseUrl + `/app-store-auth/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(appCredentials)
            });

            if (!res.ok) {
                const errorResponse = await res.json();
                throw new AuthError(errorResponse.error, errorResponse.type);
            }

            return res.json();
        }

        return Promise.reject('Something went wrong with the authorization');
    }

    private toQueryString(connectionId: string, connectionConfig?: ConnectionConfig): string {
        const query: string[] = [];

        if (connectionId) {
            query.push(`connection_id=${connectionId}`);
        }

        query.push(`public_key=${this.publicKey}`);

        if (connectionConfig) {
            for (const param in connectionConfig.params) {
                const val = connectionConfig.params[param];
                if (typeof val === 'string') {
                    query.push(`params[${param}]=${val}`);
                }
            }

            if (connectionConfig.hmac) {
                query.push(`hmac=${connectionConfig.hmac}`);
            }

            if (connectionConfig.user_scope) {
                query.push(`user_scope=${connectionConfig.user_scope.join(',')}`);
            }

            if (connectionConfig.credentials) {
                const credentials = connectionConfig.credentials;
                if ('oauth_client_id_override' in credentials && 'oauth_client_secret_override' in credentials) {
                    query.push(`credentials[oauth_client_id]=${credentials.oauth_client_id_override}`);
                    query.push(`credentials[oauth_client_secret]=${credentials.oauth_client_secret_override}`);
                }
            }

            for (const param in connectionConfig.authorization_params) {
                const val = connectionConfig.authorization_params[param];
                if (typeof val === 'string') {
                    query.push(`authorization_params[${param}]=${val}`);
                } else if (val === undefined) {
                    query.push(`authorization_params[${param}]=undefined`);
                }
            }
        }

        return query.length === 0 ? '' : '?' + query.join('&');
    }
}

interface ConnectionConfig {
    params?: Record<string, string>;
    hmac?: string;
    user_scope?: string[];
    authorization_params?: Record<string, string | undefined>;
    credentials?: OAuthCredentialsOverride | BasicApiCredentials | ApiKeyCredentials | AppStoreCredentials;
}

interface OAuthCredentialsOverride {
    oauth_client_id_override: string;
    oauth_client_secret_override: string;
}

interface BasicApiCredentials {
    username?: string;
    password?: string;
}

interface ApiKeyCredentials {
    apiKey?: string;
}

interface AppStoreCredentials {
    privateKeyId: string;
    issuerId: string;
    privateKey: string;
    scope?: string[];
}

enum AuthorizationStatus {
    IDLE,
    BUSY,
    CANCELED,
    DONE
}

/**
 * AuthorizationModal class
 */
class AuthorizationModal {
    private url: string;
    private features: Record<string, string | number>;
    private width = 500;
    private height = 600;
    public modal: Window;
    private swClient: WebSocket;
    private debug: boolean;
    public isProcessingMessage = false;

    constructor(
        webSocketUrl: string,
        url: string,
        successHandler: (providerConfigKey: string, connectionId: string) => any,
        errorHandler: (errorType: string, errorDesc: string) => any,
        { width, height }: { width?: number | null; height?: number | null },
        debug?: boolean
    ) {
        // Window modal URL
        this.url = url;
        this.debug = debug || false;

        const { left, top, computedWidth, computedHeight } = this.layout(width || this.width, height || this.height);

        // Window modal features
        this.features = {
            width: computedWidth,
            height: computedHeight,
            top,
            left,
            scrollbars: 'yes',
            resizable: 'yes',
            status: 'no',
            toolbar: 'no',
            location: 'no',
            copyhistory: 'no',
            menubar: 'no',
            directories: 'no'
        };

        this.modal = window.open('', '_blank', this.featuresToString())!;

        this.swClient = new WebSocket(webSocketUrl);

        this.swClient.onmessage = (message: MessageEvent<any>) => {
            this.isProcessingMessage = true;
            this.handleMessage(message, successHandler, errorHandler);
            this.isProcessingMessage = false;
        };
    }

    /**
     * Handles the messages received from the Nango server via WebSocket.
     */
    handleMessage(
        message: MessageEvent<any>,
        successHandler: (providerConfigKey: string, connectionId: string) => any,
        errorHandler: (errorType: string, errorDesc: string) => any
    ) {
        const data = JSON.parse(message.data);

        switch (data.message_type) {
            case WSMessageType.ConnectionAck: {
                if (this.debug) {
                    console.log(debugLogPrefix, 'Connection ack received. Opening modal...');
                }

                const wsClientId = data.ws_client_id;
                this.open(wsClientId);
                break;
            }
            case WSMessageType.Error:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Error received. Rejecting authorization...');
                }

                errorHandler(data.error_type, data.error_desc);
                this.swClient.close();
                break;
            case WSMessageType.Success:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Success received. Resolving authorization...');
                }

                successHandler(data.provider_config_key, data.connection_id);
                this.swClient.close();
                break;
            default:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Unknown message type received from Nango server. Ignoring...');
                }
                return;
        }
    }

    /**
     * The modal is expected to be in the center of the screen.
     */
    layout(expectedWidth: number, expectedHeight: number) {
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const left = screenWidth / 2 - expectedWidth / 2;
        const top = screenHeight / 2 - expectedHeight / 2;

        const computedWidth = Math.min(expectedWidth, screenWidth);
        const computedHeight = Math.min(expectedHeight, screenHeight);

        return { left: Math.max(left, 0), top: Math.max(top, 0), computedWidth, computedHeight };
    }

    /**
     * Open the modal
     */
    open(wsClientId: string) {
        this.modal.location = this.url + '&ws_client_id=' + wsClientId;
        return this.modal;
    }

    /**
     * Helper to convert the features object of this class
     * to the comma-separated list of window features required
     * by the window.open() function.
     */
    featuresToString(): string {
        const features = this.features;
        const featuresAsString: string[] = [];

        for (const key in features) {
            featuresAsString.push(key + '=' + features[key]);
        }

        return featuresAsString.join(',');
    }
}
