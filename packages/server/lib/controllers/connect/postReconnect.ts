import type { EndUser, PostPublicConnectSessionsReconnect } from '@nangohq/types';
import { z } from 'zod';
import db from '@nangohq/database';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import * as keystore from '@nangohq/keystore';
import * as connectSessionService from '../../services/connectSession.service.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { configService, connectionService, getEndUser, upsertEndUser } from '@nangohq/shared';
import { checkIntegrationsDefault, bodySchema as originalBodySchema } from './postSessions.js';
import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';

const bodySchema = z
    .object({
        connection_id: connectionIdSchema,
        integration_id: providerConfigKeySchema,
        end_user: originalBodySchema.shape.end_user.optional(),
        organization: originalBodySchema.shape.organization,
        integrations_config_defaults: originalBodySchema.shape.integrations_config_defaults
    })
    .strict();

export const postConnectSessionsReconnect = asyncWrapper<PostPublicConnectSessionsReconnect>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = bodySchema.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const body: PostPublicConnectSessionsReconnect['Body'] = val.data;

    await db.knex.transaction(async (trx) => {
        const connection = await connectionService.checkIfConnectionExists(body.connection_id, body.integration_id, environment.id);
        if (!connection) {
            res.status(400).send({
                error: { code: 'invalid_body', message: 'ConnectionID or IntegrationId does not exists' }
            });
            return;
        }

        // NB: this is debatable, right now it's safer to do it this way
        if (!connection.end_user_id && !body.end_user) {
            res.status(400).send({ error: { code: 'invalid_body', message: "Can't update a connection that was not created with a session token" } });
            return;
        }

        let endUser: EndUser;
        if (body.end_user) {
            const endUserRes = await upsertEndUser(trx, { account, environment, endUserPayload: body.end_user, organization: body.organization });
            if (endUserRes.isErr()) {
                res.status(500).send({ error: { code: 'server_error', message: endUserRes.error.message } });
                return;
            }

            endUser = endUserRes.value;
        } else {
            const endUserRes = await getEndUser(trx, { accountId: account.id, environmentId: environment.id, id: connection.end_user_id! });
            if (endUserRes.isErr()) {
                res.status(500).send({ error: { code: 'server_error', message: endUserRes.error.message } });
                return;
            }

            endUser = endUserRes.value;
        }

        if (body.integrations_config_defaults) {
            const integrations = await configService.listProviderConfigs(environment.id);

            // Enforce that integrations exists in `integrations_config_defaults`
            const check = checkIntegrationsDefault(body, integrations);
            if (check) {
                res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues: check }) } });
                return;
            }
        }

        // create connect session
        const createConnectSession = await connectSessionService.createConnectSession(trx, {
            endUserId: endUser.id,
            accountId: account.id,
            environmentId: environment.id,
            connectionId: connection.id!,
            allowedIntegrations: [body.integration_id],
            integrationsConfigDefaults: body.integrations_config_defaults
                ? Object.fromEntries(
                      Object.entries(body.integrations_config_defaults).map(([key, value]) => [
                          key,
                          { user_scopes: value.user_scopes, connectionConfig: value.connection_config }
                      ])
                  )
                : null
        });
        if (createConnectSession.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create connect session' } });
            return;
        }

        // create a private key for the connect session
        const createPrivateKey = await keystore.createPrivateKey(trx, {
            displayName: '',
            accountId: account.id,
            environmentId: environment.id,
            entityType: 'connect_session',
            entityId: createConnectSession.value.id,
            ttlInMs: 30 * 60 * 1000 // 30 minutes
        });
        if (createPrivateKey.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create session token' } });
            return;
        }

        const [token, privateKey] = createPrivateKey.value;
        res.status(201).send({ data: { token, expires_at: privateKey.expiresAt!.toISOString() } });
    });
});