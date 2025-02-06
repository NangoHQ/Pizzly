import type { ApiError, Endpoint, GetRecordsSuccess } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { records } from '@nangohq/records';
import { validateGetRecords } from './validate.js';
import type { LogContextStateless } from '@nangohq/logs';
import { logContextGetter } from '@nangohq/logs';

type GetRecords = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
    };
    Querystring: {
        model: string;
        externalIds: string[];
        cursor: string;
        limit: number;
        activityLogId: string;
    };
    Error: ApiError<'get_records_failed'>;
    Success: GetRecordsSuccess;
}>;

export const path = '/environment/:environmentId/connection/:nangoConnectionId/records';
const method = 'GET';

const validate = validateGetRecords<GetRecords>();

const handler = async (req: EndpointRequest<GetRecords>, res: EndpointResponse<GetRecords>) => {
    const {
        params: { nangoConnectionId },
        query: { model, externalIds, cursor, limit, activityLogId }
    } = req;

    let logCtx: LogContextStateless | undefined = undefined;
    if (activityLogId) {
        logCtx = logContextGetter.getStateLess({ id: String(activityLogId) });
    }

    const result = await records.getRecords({
        connectionId: nangoConnectionId,
        model,
        cursor,
        externalIds,
        limit
    });

    if (result.isOk()) {
        await logCtx?.info(`Successfully found ${result.value.records.length} records`, {
            model,
            externalIds,
            limit
        });
        res.json(result.value);
    } else {
        res.status(500).json({ error: { code: 'get_records_failed', message: `Failed to get records: ${result.error.message}` } });
    }
    return;
};

export const route: Route<GetRecords> = { path, method };

export const routeHandler: RouteHandler<GetRecords> = {
    method,
    path,
    validate,
    handler
};
