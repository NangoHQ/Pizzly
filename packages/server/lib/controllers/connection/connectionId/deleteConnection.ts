import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { DeletePublicConnection } from '@nangohq/types';
import { connectionService } from '@nangohq/shared';
import { getOrchestrator } from '../../../utils/utils.js';
import { logContextGetter } from '@nangohq/logs';
import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';

const validationQuery = z
    .object({
        provider_config_key: providerConfigKeySchema
    })
    .strict();
const validationParams = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

const orchestrator = getOrchestrator();

export const deletePublicConnection = asyncWrapper<DeletePublicConnection>(async (req, res) => {
    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const { environment } = res.locals;
    const params: DeletePublicConnection['Params'] = valParams.data;
    const query: DeletePublicConnection['Querystring'] = valQuery.data;

    const { success, response: connection } = await connectionService.getConnection(params.connectionId, query.provider_config_key, environment.id);

    if (!success || !connection) {
        res.status(400).send({ error: { code: 'unknown_connection' } });
        return;
    }

    const deleted = await connectionService.deleteConnection({
        connection,
        providerConfigKey: query.provider_config_key,
        environmentId: environment.id,
        logContextGetter,
        orchestrator
    });

    res.status(200).send({ success: deleted > 0 });
});