import { schema } from '@nangohq/shared';
import type { DataResponse, UpsertResponse } from '@nangohq/shared';

/**
 * Upsert
 */
export async function upsert(response: DataResponse[], dbTable: string, uniqueKey: string, nangoConnectionId: number): Promise<UpsertResponse> {
    const addedKeys = await getAddedKeys(response, dbTable, uniqueKey, nangoConnectionId);
    const updatedKeys = await getUpdatedKeys(response, dbTable, uniqueKey, nangoConnectionId);

    // TODO change updated_at column, trigger to do that
    const results = await schema()
        .from(dbTable)
        .insert(response, ['id', 'external_id'])
        .onConflict(['nango_connection_id', 'external_id', 'model'])
        .merge()
        .returning(['id', 'external_id']);

    const affectedInternalIds = results.map((tuple) => tuple.id) as string[];
    const affectedExternalIds = results.map((tuple) => tuple.external_id) as string[];

    return { addedKeys, updatedKeys, affectedInternalIds, affectedExternalIds };
}

/**
 * Compute Added Keys
 * @desc for any incoming payload use the provided unique to check against the rows
 * in the database and return the keys that are not in the database
 *
 */
export async function getAddedKeys(response: DataResponse[], dbTable: string, uniqueKey: string, nangoConnectionId: number): Promise<Array<string>> {
    const keys: Array<string> = response.map((data: DataResponse) => String(data[uniqueKey]));

    const knownKeys: Array<string> = (await schema()
        .from(dbTable)
        .where('nango_connection_id', nangoConnectionId)
        .whereIn('external_id', keys)
        .pluck('external_id')) as unknown as Array<string>;

    const unknownKeys: Array<string> = keys?.filter((data: string) => !knownKeys.includes(data));

    return unknownKeys;
}

/**
 * Get Updated Keys
 * @desc generate an array of the keys that exist in the database and also in
 * the incoming payload that will be used to update the database.
 * Compare using the data_hash key
 *
 */
export async function getUpdatedKeys(response: DataResponse[], dbTable: string, uniqueKey: string, nangoConnectionId: number): Promise<Array<string>> {
    const keys: Array<string> = response.map((data: DataResponse) => String(data[uniqueKey]));
    const keysWithHash: [string, string][] = response.map((data: DataResponse) => [String(data[uniqueKey]), data['data_hash'] as string]);

    const rowsToUpdate = await schema()
        .from(dbTable)
        .pluck('external_id')
        .where('nango_connection_id', nangoConnectionId)
        .whereIn('external_id', keys)
        .whereNotIn(['external_id', 'data_hash'], keysWithHash);

    return rowsToUpdate;
}

/**
async function bulkInsert(dataToInsert: DataResponse[], dbTable: string): Promise<boolean> {
    const trx = await db.knex.transaction();
    try {
        await db.knex.batchInsert(`${schemaName}.${dbTable}`, dataToInsert).transacting(trx);
        await trx.commit();

        return true;
    } catch (error) {
        await trx.rollback();
        console.error('Error creating model:', error);
        throw error;
    }
}
*/
