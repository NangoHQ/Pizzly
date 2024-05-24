import type { Request, Response, NextFunction } from 'express';
import type {
    Config as ProviderConfig,
    Template as ProviderTemplate,
    Connection,
    OAuth2Credentials,
    OAuth2ClientCredentials,
    ImportedCredentials,
    AuthCredentials,
    TemplateOAuth2 as ProviderTemplateOAuth2,
    ConnectionList,
    LogLevel,
    ConnectionUpsertResponse
} from '@nangohq/shared';
import {
    db,
    AuthModes as ProviderAuthModes,
    LogActionEnum,
    configService,
    connectionService,
    errorManager,
    analytics,
    AnalyticsTypes,
    AuthOperation,
    NangoError,
    createActivityLogAndLogMessage,
    accountService,
    SlackService
} from '@nangohq/shared';
import { NANGO_ADMIN_UUID } from './account.controller.js';
import { metrics } from '@nangohq/utils';
import { logContextGetter } from '@nangohq/logs';
import type { RequestLocals } from '../utils/express.js';
import { connectionCreated as connectionCreatedHook, connectionCreationStartCapCheck as connectionCreationStartCapCheckHook } from '../hooks/hooks.js';
import { getOrchestratorClient } from '../utils/utils.js';

class ConnectionController {
    /**
     * Webapp
     */

    async getConnectionWeb(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment, account } = res.locals;

            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;
            const instantRefresh = req.query['force_refresh'] === 'true';

            const action = LogActionEnum.TOKEN;

            const log = {
                level: 'info' as LogLevel,
                success: false,
                action,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: connectionId,
                provider: '',
                provider_config_key: providerConfigKey,
                environment_id: environment.id
            };

            let success: boolean;
            let error: NangoError | null = null;
            let connection: Connection | null = null;
            if (instantRefresh) {
                const credentialResponse = await connectionService.getConnectionCredentials({
                    account,
                    environment,
                    connectionId,
                    providerConfigKey,
                    logContextGetter,
                    instantRefresh
                });
                success = credentialResponse.isOk();

                if (credentialResponse.isOk()) {
                    connection = credentialResponse.value;
                } else {
                    error = credentialResponse.error;
                }
            } else {
                ({ success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id));
            }

            if (!success || !connection) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            const config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key, environment.id);

            if (!config) {
                const activityLogId = await createActivityLogAndLogMessage(log, {
                    level: 'error',
                    environment_id: environment.id,
                    timestamp: Date.now(),
                    content: 'Unknown provider config'
                });
                const logCtx = await logContextGetter.create(
                    { id: String(activityLogId), operation: { type: 'auth', action: 'refresh_token' }, message: 'Get connection web' },
                    {
                        account,
                        environment,
                        integration: { id: connection.config_id!, name: connection.provider_config_key, provider: 'unknown' },
                        connection: { id: connection.id!, name: connection.connection_id }
                    }
                );
                await logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            const template: ProviderTemplate | undefined = configService.getTemplate(config.provider);

            // if instantRefresh is true, we already refreshed the credentials
            if (
                !instantRefresh &&
                (connection.credentials.type === ProviderAuthModes.OAuth2 ||
                    connection.credentials.type === ProviderAuthModes.App ||
                    connection.credentials.type === ProviderAuthModes.OAuth2CC)
            ) {
                const {
                    success,
                    error,
                    response: credentials
                } = await connectionService.refreshCredentialsIfNeeded({
                    connection,
                    providerConfig: config,
                    template: template as ProviderTemplateOAuth2,
                    environment_id: environment.id,
                    instantRefresh
                });

                if (!success) {
                    errorManager.errResFromNangoErr(res, error);
                    return;
                }

                connection.credentials = credentials as OAuth2Credentials | OAuth2ClientCredentials;
            }

            if (instantRefresh) {
                log.provider = config.provider;
                log.success = true;

                const activityLogId = await createActivityLogAndLogMessage(log, {
                    level: 'info',
                    environment_id: environment.id,
                    auth_mode: template.auth_mode,
                    content: `Token manual refresh fetch was successful for ${providerConfigKey} and connection ${connectionId} from the web UI`,
                    timestamp: Date.now()
                });
                const logCtx = await logContextGetter.create(
                    { id: String(activityLogId), operation: { type: 'auth', action: 'refresh_token' }, message: 'Get connection web' },
                    {
                        account,
                        environment,
                        integration: { id: config.id!, name: config.unique_key, provider: config.provider },
                        connection: { id: connection.id!, name: connection.connection_id }
                    }
                );
                await logCtx.info(`Token manual refresh fetch was successful for ${providerConfigKey} and connection ${connectionId} from the web UI`);
                await logCtx.success();
            }

            let rawCredentials = null;
            let credentials = null;

            if (connection.credentials.type === ProviderAuthModes.OAuth1 || connection.credentials.type === ProviderAuthModes.OAuth2) {
                credentials = connection.credentials;
                rawCredentials = credentials.raw;
            }

            if (connection.credentials.type === ProviderAuthModes.OAuth2CC) {
                credentials = connection.credentials;
                rawCredentials = credentials.raw;
            }

            if (connection.credentials.type === ProviderAuthModes.App) {
                credentials = connection.credentials;
                rawCredentials = credentials.raw;
            }

            if (connection.credentials.type === ProviderAuthModes.Basic || connection.credentials.type === ProviderAuthModes.ApiKey) {
                credentials = connection.credentials;
            }

            res.status(200).send({
                connection: {
                    id: connection.id,
                    connectionId: connection.connection_id,
                    provider: config.provider,
                    providerConfigKey: connection.provider_config_key,
                    creationDate: connection.created_at,
                    oauthType: connection.credentials.type || 'None',
                    connectionConfig: connection.connection_config,
                    connectionMetadata: connection.metadata,
                    accessToken:
                        connection.credentials.type === ProviderAuthModes.OAuth2 || connection.credentials.type === ProviderAuthModes.App
                            ? connection.credentials.access_token
                            : null,
                    refreshToken: connection.credentials.type === ProviderAuthModes.OAuth2 ? connection.credentials.refresh_token : null,
                    expiresAt:
                        connection.credentials.type === ProviderAuthModes.OAuth2 || connection.credentials.type === ProviderAuthModes.App
                            ? connection.credentials.expires_at
                            : null,
                    oauthToken: connection.credentials.type === ProviderAuthModes.OAuth1 ? connection.credentials.oauth_token : null,
                    oauthTokenSecret: connection.credentials.type === ProviderAuthModes.OAuth1 ? connection.credentials.oauth_token_secret : null,
                    credentials,
                    rawCredentials
                }
            });
        } catch (err) {
            next(err);
        }
    }

    async getConnectionsWeb(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;

            const connections = await connectionService.listConnections(environment.id);

            const configs = await configService.listProviderConfigs(environment.id);

            if (configs == null) {
                res.status(200).send({ connections: [] });

                return;
            }

            const uniqueKeyToProvider: Record<string, string> = {};
            const providerConfigKeys = configs.map((config: ProviderConfig) => config.unique_key);

            providerConfigKeys.forEach((key: string, i: number) => (uniqueKeyToProvider[key] = configs[i]!.provider));

            const result = connections.map((connection) => {
                return {
                    id: connection.id,
                    connectionId: connection.connection_id,
                    providerConfigKey: connection.provider,
                    provider: uniqueKeyToProvider[connection.provider],
                    creationDate: connection.created
                };
            });

            res.status(200).send({
                connections: result.sort(function (a, b) {
                    return new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime();
                })
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * CLI/SDK/API
     */

    async getConnectionCreds(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment, account } = res.locals;
            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;
            const returnRefreshToken = req.query['refresh_token'] === 'true';
            const instantRefresh = req.query['force_refresh'] === 'true';
            const isSync = (req.get('Nango-Is-Sync') as string) === 'true';

            if (!isSync) {
                metrics.increment(metrics.Types.GET_CONNECTION, 1, { accountId: account.id });
            }

            const credentialResponse = await connectionService.getConnectionCredentials({
                account,
                environment,
                connectionId,
                providerConfigKey,
                logContextGetter,
                instantRefresh
            });

            if (credentialResponse.isErr()) {
                errorManager.errResFromNangoErr(res, credentialResponse.error);

                return;
            }

            const { value: connection } = credentialResponse;

            if (connection && connection.credentials && connection.credentials.type === ProviderAuthModes.OAuth2 && !returnRefreshToken) {
                if (connection.credentials.refresh_token) {
                    delete connection.credentials.refresh_token;
                }

                if (connection.credentials.raw && connection.credentials.raw['refresh_token']) {
                    const rawCreds = { ...connection.credentials.raw }; // Properties from 'raw' are not mutable so we need to create a new object.
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete rawCreds['refresh_token'];
                    connection.credentials.raw = rawCreds;
                }
            }

            res.status(200).send(connection);
        } catch (err) {
            next(err);
        }
    }

    async listConnections(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
            const accountId = res.locals['account'].id;
            const isWeb = res.locals['authType'] === 'session' || res.locals['authType'] === 'none';

            const { connectionId } = req.query;
            const connections = await connectionService.listConnections(environmentId, connectionId as string);

            if (!isWeb) {
                void analytics.track(AnalyticsTypes.CONNECTION_LIST_FETCHED, accountId);
            }

            const configs = await configService.listProviderConfigs(environmentId);

            if (configs == null) {
                res.status(200).send({ connections: [] });

                return;
            }

            const uniqueKeyToProvider: Record<string, string> = {};
            const providerConfigKeys = configs.map((config: ProviderConfig) => config.unique_key);

            providerConfigKeys.forEach((key: string, i: number) => (uniqueKeyToProvider[key] = configs[i]!.provider));

            const result: ConnectionList[] = connections.map((connection) => {
                return {
                    id: connection.id,
                    connection_id: connection.connection_id,
                    provider_config_key: connection.provider,
                    provider: uniqueKeyToProvider[connection.provider] as string,
                    created: connection.created,
                    metadata: connection.metadata
                };
            });

            res.status(200).send({
                connections: result.sort(function (a, b) {
                    return new Date(b.created).getTime() - new Date(a.created).getTime();
                })
            });
        } catch (err) {
            next(err);
        }
    }

    async deleteConnection(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;

            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (connection == null) {
                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            await connectionService.deleteConnection(connection, providerConfigKey, environment.id);

            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    async deleteAdminConnection(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
            const connectionId = req.params['connectionId'] as string;

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
                return;
            }

            const integration_key = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
            const nangoAdminUUID = NANGO_ADMIN_UUID;
            const env = 'prod';

            const info = await accountService.getAccountAndEnvironmentIdByUUID(nangoAdminUUID as string, env);
            const {
                success,
                error,
                response: connection
            } = await connectionService.getConnection(connectionId, integration_key, info?.environmentId as number);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (connection == null) {
                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey: integration_key, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            await connectionService.deleteConnection(connection, integration_key, info?.environmentId as number);

            const slackNotificationService = new SlackService(getOrchestratorClient());
            await slackNotificationService.closeAllOpenNotifications(environment.id);

            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    async listProviders(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const providers = Object.entries(configService.getTemplates())
                .map((providerProperties: [string, ProviderTemplate]) => {
                    const [provider, properties] = providerProperties;
                    return {
                        name: provider,
                        defaultScopes: properties.default_scopes,
                        authMode: properties.auth_mode,
                        categories: properties.categories
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name));
            res.status(200).send(providers);
        } catch (err) {
            next(err);
        }
    }

    async setMetadataLegacy(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
            const connectionId = (req.params['connectionId'] as string) || (req.get('Connection-Id') as string);
            const providerConfigKey = (req.query['provider_config_key'] as string) || (req.get('Provider-Config-Key') as string);

            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (!connection || !connection.id) {
                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            await db.knex.transaction(async (trx) => {
                await connectionService.replaceMetadata([connection.id as number], req.body, trx);
            });

            res.status(201).send(req.body);
        } catch (err) {
            next(err);
        }
    }

    async updateMetadataLegacy(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
            const connectionId = (req.params['connectionId'] as string) || (req.get('Connection-Id') as string);
            const providerConfigKey = (req.query['provider_config_key'] as string) || (req.get('Provider-Config-Key') as string);

            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (!connection) {
                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            await connectionService.updateMetadata([connection], req.body);

            res.status(200).send(req.body);
        } catch (err) {
            next(err);
        }
    }

    async createConnection(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment, account } = res.locals;

            const { connection_id, provider_config_key } = req.body;

            if (!connection_id) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (!provider_config_key) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const provider = await configService.getProviderName(provider_config_key);

            if (!provider) {
                const error = new NangoError('unknown_provider_config', { providerConfigKey: provider_config_key, environmentName: environment.name });

                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (account.is_capped && provider_config_key) {
                const isCapped = await connectionCreationStartCapCheckHook({
                    providerConfigKey: provider_config_key,
                    environmentId: environment.id,
                    creationType: 'import'
                });
                if (isCapped) {
                    errorManager.errRes(res, 'resource_capped');
                    return;
                }
            }

            const template = configService.getTemplate(provider);

            let oAuthCredentials: ImportedCredentials;
            let updatedConnection: ConnectionUpsertResponse = {} as ConnectionUpsertResponse;

            let runHook = false;

            if (template.auth_mode === ProviderAuthModes.OAuth2) {
                const { access_token, refresh_token, expires_at, expires_in, metadata, connection_config, no_expiration: noExpiration } = req.body;

                const { expires_at: parsedExpiresAt } = connectionService.parseRawCredentials(
                    { access_token, refresh_token, expires_at, expires_in },
                    template.auth_mode
                ) as OAuth2Credentials;

                if (!access_token) {
                    errorManager.errRes(res, 'missing_access_token');
                    return;
                }

                if (!parsedExpiresAt && noExpiration !== true) {
                    errorManager.errRes(res, 'missing_expires_at');
                    return;
                }

                if (parsedExpiresAt && isNaN(parsedExpiresAt.getTime())) {
                    errorManager.errRes(res, 'invalid_expires_at');
                    return;
                }

                oAuthCredentials = {
                    type: template.auth_mode,
                    access_token,
                    refresh_token,
                    expires_at: expires_at || parsedExpiresAt,
                    expires_in,
                    metadata,
                    connection_config,
                    raw: req.body.raw || req.body
                };

                if (req.body['oauth_client_id_override']) {
                    oAuthCredentials.config_override = {
                        client_id: req.body['oauth_client_id_override']
                    };
                }

                if (req.body['oauth_client_secret_override']) {
                    oAuthCredentials.config_override = {
                        ...oAuthCredentials.config_override,
                        client_secret: req.body['oauth_client_secret_override']
                    };
                }

                if (connection_config) {
                    oAuthCredentials.connection_config = {
                        ...oAuthCredentials.connection_config,
                        ...req.body['connection_config']
                    };
                    if (connection_config['oauth_scopes_override']) {
                        const scopesOverride = connection_config['oauth_scopes_override'];
                        oAuthCredentials.connection_config = {
                            ...oAuthCredentials.connection_config,
                            oauth_scopes_override: !Array.isArray(scopesOverride) ? scopesOverride.split(',') : scopesOverride
                        };
                    }
                }

                const connCreatedHook = async (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            id: res.id,
                            connection_id,
                            provider_config_key,
                            environment,
                            account,
                            auth_mode: ProviderAuthModes.OAuth2,
                            operation: res.operation
                        },
                        provider,
                        logContextGetter,
                        null
                    );
                };

                const [imported] = await connectionService.importOAuthConnection(
                    connection_id,
                    provider_config_key,
                    provider,
                    environment.id,
                    account.id,
                    oAuthCredentials,
                    connCreatedHook
                );

                if (imported) {
                    updatedConnection = imported;
                }
            } else if (template.auth_mode === ProviderAuthModes.OAuth1) {
                const { oauth_token, oauth_token_secret } = req.body;

                if (!oauth_token) {
                    errorManager.errRes(res, 'missing_oauth_token');
                    return;
                }

                if (!oauth_token_secret) {
                    errorManager.errRes(res, 'missing_oauth_token_secret');
                    return;
                }

                oAuthCredentials = {
                    type: template.auth_mode,
                    oauth_token,
                    oauth_token_secret,
                    raw: req.body.raw || req.body
                };

                const connCreatedHook = async (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            id: res.id,
                            connection_id,
                            provider_config_key,
                            environment,
                            account,
                            auth_mode: ProviderAuthModes.OAuth2,
                            operation: res.operation
                        },
                        provider,
                        logContextGetter,
                        null
                    );
                };

                const [imported] = await connectionService.importOAuthConnection(
                    connection_id,
                    provider_config_key,
                    provider,
                    environment.id,
                    account.id,
                    oAuthCredentials,
                    connCreatedHook
                );

                if (imported) {
                    updatedConnection = imported;
                }
            } else if (template.auth_mode === ProviderAuthModes.Basic) {
                const { username, password } = req.body;

                if (!username) {
                    errorManager.errRes(res, 'missing_basic_username');
                    return;
                }

                const credentials = {
                    type: template.auth_mode,
                    username,
                    password
                };

                const connCreatedHook = async (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            id: res.id,
                            connection_id,
                            provider_config_key,
                            environment,
                            account,
                            auth_mode: ProviderAuthModes.ApiKey,
                            operation: res.operation
                        },
                        provider,
                        logContextGetter,
                        null
                    );
                };
                const [imported] = await connectionService.importApiAuthConnection(
                    connection_id,
                    provider_config_key,
                    provider,
                    environment.id,
                    account.id,
                    credentials,
                    connCreatedHook
                );

                if (imported) {
                    updatedConnection = imported;
                }
            } else if (template.auth_mode === ProviderAuthModes.ApiKey) {
                const { api_key: apiKey } = req.body;

                if (!apiKey) {
                    errorManager.errRes(res, 'missing_api_key');
                    return;
                }

                const credentials = {
                    type: template.auth_mode,
                    apiKey
                };

                const connCreatedHook = async (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            id: res.id,
                            connection_id,
                            provider_config_key,
                            environment,
                            account,
                            auth_mode: ProviderAuthModes.ApiKey,
                            operation: res.operation
                        },
                        provider,
                        logContextGetter,
                        null
                    );
                };

                const [imported] = await connectionService.importApiAuthConnection(
                    connection_id,
                    provider_config_key,
                    provider,
                    environment.id,
                    account.id,
                    credentials,
                    connCreatedHook
                );

                if (imported) {
                    updatedConnection = imported;
                }
            } else if (template.auth_mode === ProviderAuthModes.App) {
                const { app_id, installation_id } = req.body;

                if (!app_id) {
                    errorManager.errRes(res, 'missing_app_id');
                    return;
                }

                if (!installation_id) {
                    errorManager.errRes(res, 'missing_installation_id');
                    return;
                }

                const connectionConfig = {
                    installation_id,
                    app_id
                };

                const config = await configService.getProviderConfig(provider_config_key as string, environment.id);

                if (!config) {
                    errorManager.errRes(res, 'unknown_provider_config');
                    return;
                }

                const { success, error, response: credentials } = await connectionService.getAppCredentials(template, config, connectionConfig);

                if (!success || !credentials) {
                    errorManager.errResFromNangoErr(res, error);
                    return;
                }

                const [imported] = await connectionService.upsertConnection(
                    connection_id,
                    provider_config_key,
                    provider,
                    credentials as unknown as AuthCredentials,
                    connectionConfig,
                    environment.id,
                    account.id
                );

                if (imported) {
                    updatedConnection = imported;
                    runHook = true;
                }
            } else if (template.auth_mode === ProviderAuthModes.None) {
                const [imported] = await connectionService.upsertUnauthConnection(connection_id, provider_config_key, provider, environment.id, account.id);

                if (imported) {
                    updatedConnection = imported;
                    runHook = true;
                }
            } else {
                errorManager.errRes(res, 'unknown_oauth_type');
                return;
            }

            if (updatedConnection && updatedConnection.id && runHook) {
                void connectionCreatedHook(
                    {
                        id: updatedConnection.id,
                        connection_id,
                        provider_config_key,
                        environment,
                        account,
                        auth_mode: template.auth_mode,
                        operation: updatedConnection.operation || AuthOperation.UNKNOWN
                    },
                    provider,
                    logContextGetter,
                    null
                );
            }

            res.status(201).send(req.body);
        } catch (err) {
            next(err);
        }
    }
}

export default new ConnectionController();
