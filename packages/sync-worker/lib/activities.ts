import * as uuid from 'uuid';
import { Nango } from '@nangohq/node';
import db from './db/database.js';
import {
    getById as getSyncById,
    updateStatus as updateSyncStatus,
    create as createSync,
    Sync,
    SyncStatus,
    SyncType,
    Connection,
    Config as ProviderConfig,
    getConnectionById,
    configService,
    updateSuccess,
    createActivityLogMessageAndEnd
} from '@nangohq/shared';
import type { GithubIssues } from './models/Ticket.js';
import type { NangoConnection, ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';
import { createOrUpdate as createOrUpdateTicket } from './services/ticket.service.js';

export function getServerPort() {
    return process.env['SERVER_PORT'] != null ? +process.env['SERVER_PORT'] : 3003;
}

function getServerHost() {
    return process.env['SERVER_HOST'] || process.env['SERVER_RUN_MODE'] === 'DOCKERIZED' ? 'http://nango-server' : 'http://localhost';
}

export function getServerBaseUrl() {
    return getServerHost() + `:${getServerPort()}`;
}

export async function syncActivity(name: string): Promise<string> {
    return `Synced, ${name}!`;
}

export async function routeSync(args: InitialSyncArgs): Promise<boolean> {
    const { syncId, activityLogId } = args;
    const sync: Sync = (await getSyncById(syncId, db)) as Sync;
    // TODO this doesn't use the correct configuration for the env
    const nangoConnection = await getConnectionById(sync.nango_connection_id);
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number,
        db
    )) as ProviderConfig;
    return route(sync, nangoConnection as Connection, syncConfig, activityLogId);
}

export async function scheduleAndRouteSync(args: ContinuousSyncArgs): Promise<boolean> {
    const { nangoConnectionId, activityLogId } = args;
    const sync: Sync = (await createSync(nangoConnectionId, SyncType.INCREMENTAL, db)) as Sync;
    const nangoConnection: NangoConnection = (await getConnectionById(nangoConnectionId)) as NangoConnection;
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number,
        db
    )) as ProviderConfig;

    return route(sync, nangoConnection, syncConfig, activityLogId);
}

export async function route(sync: Sync, nangoConnection: NangoConnection, syncConfig: ProviderConfig, activityLogId: number): Promise<boolean> {
    let response = false;

    switch (syncConfig?.provider) {
        case 'github':
            response = await syncGithub(sync, nangoConnection, activityLogId);
            break;
        case 'asana':
            break;
    }

    return response;
}

export async function syncGithub(sync: Sync, nangoConnection: NangoConnection, activityLogId: number): Promise<boolean> {
    const nango = new Nango({ host: getServerBaseUrl() });

    if (!nango) {
        return false;
    }

    // TODO doesnt work for a user, incorrect scopes
    // TODO environment variables aren't picked up correctly
    const response = await nango.get({
        connectionId: nangoConnection?.connection_id as string,
        providerConfigKey: nangoConnection?.provider_config_key as string,
        headers: {
            'Nango-Proxy-Accept': 'application/vnd.github+json',
            'Nango-Proxy-X-Github-Api-Version-Id': '2022-11-18'
        },
        endpoint: 'repos/NangoHq/nango/issues'
    });

    if (!response) {
        return false;
    }

    const result = await insertModel(response.data as unknown as GithubIssues);

    if (result) {
        await updateSyncStatus(sync.id, SyncStatus.SUCCESS, db);
        await updateSuccess(activityLogId, true);

        await createActivityLogMessageAndEnd({
            level: 'info',
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `The ${sync.type} sync has been completed`
        });
    } else {
        await createActivityLogMessageAndEnd({
            level: 'error',
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `The ${sync.type} sync did not complete successfully`
        });
    }

    return result;
}

// bulk insert/ update and make generic
async function insertModel(issues: GithubIssues): Promise<boolean> {
    let result = true;
    const models = [];
    for (const issue of issues) {
        const model = {
            id: uuid.v4(),
            external_id: issue.id,
            title: issue.title,
            description: issue.body as string,
            status: issue.state, // TODO modify this to fit the enum
            external_raw_status: issue.state,
            number_of_comments: issue.comments,
            comments: issue.comments, // TODO fetch comments
            creator: issue?.user?.login as string, // do a more thorough lookup?
            external_created_at: issue.created_at,
            external_updated_at: issue.updated_at,
            deleted_at: null,
            raw_json: issue
        };
        models.push(model);

        const insert = await createOrUpdateTicket(model);

        if (!insert) {
            result = false;
        }
    }

    return result;
}
