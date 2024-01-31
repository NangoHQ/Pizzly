import type { NextFunction, Request, Response } from 'express';
import {
    setLastSyncDate,
    createActivityLogMessage,
    LogLevel,
    errorManager,
    ErrorSourceEnum,
    LogActionEnum,
    updateSyncJobResult,
    DataResponse,
    dataService,
    syncDataService,
    getSyncConfigByJobId,
    DataRecord,
    UpsertResponse
} from '@nangohq/shared';
import tracer from '../tracer.js';
import type { Span } from 'dd-trace';
import { Result, ok, err } from '../utils/result.js';

type persistType = 'save' | 'delete' | 'update';
type RecordRequest = Request<
    {
        environmentId: number;
        connectionId: string;
        syncId: string;
        syncJobId: number;
    },
    any,
    {
        model: string;
        records: Record<string, any>[];
        providerConfigKey: string;
        nangoConnectionId: number;
        activityLogId: number;
        trackDeletes: boolean;
        lastSyncDate: Date;
    },
    any,
    Record<string, any>
>;

class PersistController {
    public async saveLastSyncDate(req: Request<{ syncId: string }, any, { lastSyncDate: Date }, any, Record<string, any>>, res: Response, next: NextFunction) {
        const {
            params: { syncId },
            body: { lastSyncDate }
        } = req;
        const result = await setLastSyncDate(syncId, lastSyncDate);
        if (result) {
            res.status(201).send();
        } else {
            next(new Error(`Failed to save last sync date '${lastSyncDate}' for sync '${syncId}'`));
        }
    }

    public async saveActivityLog(
        req: Request<{ environmentId: number }, any, { activityLogId: number; level: LogLevel; msg: string }, any, Record<string, any>>,
        res: Response,
        next: NextFunction
    ) {
        const {
            params: { environmentId },
            body: { activityLogId, level, msg }
        } = req;
        const result = await createActivityLogMessage(
            {
                level,
                environment_id: environmentId,
                activity_log_id: activityLogId,
                content: msg,
                timestamp: Date.now()
            },
            false
        );
        if (result) {
            res.status(201).send();
        } else {
            next(new Error(`Failed to save log ${activityLogId}`));
        }
    }

    public async saveRecords(req: RecordRequest, res: Response, next: NextFunction) {
        const {
            params: { environmentId, connectionId, syncId, syncJobId },
            body: { model, records, providerConfigKey, nangoConnectionId, trackDeletes, lastSyncDate, activityLogId }
        } = req;
        const persist = async (dataRecords: DataRecord[]) => {
            return await dataService.upsert(
                dataRecords,
                '_nango_sync_data_records',
                'external_id',
                nangoConnectionId,
                model,
                activityLogId,
                environmentId,
                trackDeletes,
                false
            );
        };
        const result = await PersistController.persistRecords({
            persistType: 'save',
            environmentId,
            connectionId,
            providerConfigKey,
            nangoConnectionId,
            syncId,
            syncJobId,
            model,
            records,
            trackDeletes,
            lastSyncDate,
            activityLogId,
            softDelete: false,
            persistFunction: persist
        });
        if (result.ok) {
            res.status(201).send();
        } else {
            next(new Error(`'Failed to save records': ${result.error.message}`));
        }
    }

    public async deleteRecords(req: RecordRequest, res: Response, next: NextFunction) {
        const {
            params: { environmentId, connectionId, syncId, syncJobId },
            body: { model, records, providerConfigKey, nangoConnectionId, trackDeletes, lastSyncDate, activityLogId }
        } = req;
        const persist = async (dataRecords: DataRecord[]) => {
            return await dataService.upsert(
                dataRecords,
                '_nango_sync_data_records',
                'external_id',
                nangoConnectionId,
                model,
                activityLogId,
                environmentId,
                trackDeletes,
                true
            );
        };
        const result = await PersistController.persistRecords({
            persistType: 'delete',
            environmentId,
            connectionId,
            providerConfigKey,
            nangoConnectionId,
            syncId,
            syncJobId,
            model,
            records,
            trackDeletes,
            lastSyncDate,
            activityLogId,
            softDelete: true,
            persistFunction: persist
        });
        if (result.ok) {
            res.status(201).send();
        } else {
            next(new Error(`'Failed to delete records': ${result.error.message}`));
        }
    }

    public async updateRecords(req: RecordRequest, res: Response, next: NextFunction) {
        const {
            params: { environmentId, connectionId, syncId, syncJobId },
            body: { model, records, providerConfigKey, nangoConnectionId, trackDeletes, lastSyncDate, activityLogId }
        } = req;
        const persist = async (dataRecords: DataRecord[]) => {
            return await dataService.updateRecord(
                dataRecords,
                '_nango_sync_data_records',
                'external_id',
                nangoConnectionId,
                model,
                activityLogId,
                environmentId
            );
        };
        const result = await PersistController.persistRecords({
            persistType: 'update',
            environmentId,
            connectionId,
            providerConfigKey,
            nangoConnectionId,
            syncId,
            syncJobId,
            model,
            records,
            trackDeletes,
            lastSyncDate,
            activityLogId,
            softDelete: false,
            persistFunction: persist
        });
        if (result.ok) {
            res.status(201).send();
        } else {
            next(new Error(`'Failed to update records': ${result.error.message}`));
        }
    }

    private static async persistRecords({
        persistType,
        environmentId,
        connectionId,
        providerConfigKey,
        nangoConnectionId,
        syncId,
        syncJobId,
        model,
        records,
        trackDeletes,
        lastSyncDate,
        activityLogId,
        softDelete,
        persistFunction
    }: {
        persistType: persistType;
        environmentId: number;
        connectionId: string;
        providerConfigKey: string;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
        model: string;
        records: Record<string, any>[];
        trackDeletes: boolean;
        lastSyncDate: Date;
        activityLogId: number;
        softDelete: boolean;
        persistFunction: (records: DataRecord[]) => Promise<UpsertResponse>;
    }): Promise<Result<void>> {
        const active = tracer.scope().active();
        const span = tracer.startSpan('persistRecords', {
            childOf: active as Span,
            tags: {
                persistType,
                environmentId,
                connectionId,
                providerConfigKey,
                nangoConnectionId,
                syncId,
                syncJobId,
                model,
                activityLogId
            }
        });
        const {
            success,
            error,
            response: formattedRecords
        } = syncDataService.formatDataRecords(
            records as unknown as DataResponse[],
            nangoConnectionId,
            model,
            syncId,
            syncJobId,
            lastSyncDate,
            trackDeletes,
            softDelete
        );

        if (!success || formattedRecords === null) {
            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                content: `There was an issue with the batch ${persistType}. ${error?.message}`,
                timestamp: Date.now()
            });
            const errMsg = `Failed to ${persistType} records ${activityLogId}`;
            span.setTag('error', errMsg).finish();
            return err(errMsg);
        }
        const syncConfig = await getSyncConfigByJobId(syncJobId);

        if (syncConfig && !syncConfig?.models.includes(model)) {
            const errMsg = `The model '${model}' is not included in the declared sync models: ${syncConfig.models}.`;
            span.setTag('error', errMsg).finish();
            return err(errMsg);
        }

        const persistResult = await persistFunction(formattedRecords);

        if (persistResult.success) {
            const { summary } = persistResult;
            const updatedResults = {
                [model]: {
                    added: summary?.addedKeys.length as number,
                    updated: summary?.updatedKeys.length as number,
                    deleted: summary?.deletedKeys?.length as number
                }
            };

            span.addTags({
                'records.count': records.length,
                'records.sizeInBytes': Buffer.byteLength(JSON.stringify(records), 'utf8')
            });

            await createActivityLogMessage({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                content: `Batch ${persistType} was a success and resulted in ${JSON.stringify(updatedResults, null, 2)}`,
                timestamp: Date.now()
            });

            await updateSyncJobResult(syncJobId, updatedResults, model);
            span.finish();
            return ok(void 0);
        } else {
            const content = `There was an issue with the batch ${persistType}. ${persistResult?.error}`;

            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                content,
                timestamp: Date.now()
            });

            await errorManager.report(content, {
                environmentId: environmentId,
                source: ErrorSourceEnum.CUSTOMER,
                operation: LogActionEnum.SYNC,
                metadata: {
                    connectionId: connectionId,
                    providerConfigKey: providerConfigKey,
                    syncId: syncId,
                    nangoConnectionId: nangoConnectionId,
                    syncJobId: syncJobId
                }
            });
            const errMsg = persistResult?.error!;
            span.setTag('error', errMsg).finish();
            return err(errMsg);
        }
    }
}

export default new PersistController();
