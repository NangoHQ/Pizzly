/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import type { Endpoint } from '../api';
import type { MessageRow, MessageState, OperationList, OperationRow } from './messages';

type Concat<T extends OperationList> = T[keyof T] | (T extends { action: string } ? `${T['type']}:${T['action']}` : never);

export type SearchOperations = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/operations';
    Querystring: { env: string };
    Body: {
        limit?: number;
        states?: SearchOperationsState[];
        types?: SearchOperationsType[];
        integrations?: SearchOperationsIntegration[] | undefined;
        connections?: SearchOperationsConnection[] | undefined;
        syncs?: SearchOperationsSync[] | undefined;
        period?: SearchOperationsPeriod | undefined;
        cursor?: string | null | undefined;
    };
    Success: {
        data: OperationRow[];
        pagination: { total: number; cursor: string | null };
    };
}>;
export type SearchOperationsState = 'all' | MessageState;
export type SearchOperationsType = 'all' | Concat<OperationList>;
export type SearchOperationsIntegration = 'all' | string;
export type SearchOperationsConnection = 'all' | string;
export type SearchOperationsSync = 'all' | string;
export interface SearchOperationsPeriod {
    from: string;
    to: string;
}
export type SearchOperationsData = SearchOperations['Success']['data'][0];

export type GetOperation = Endpoint<{
    Method: 'GET';
    Path: `/api/v1/logs/operations/:operationId`;
    Querystring: { env: string };
    Params: { operationId: string };
    Success: {
        data: OperationRow;
    };
}>;

export type SearchMessages = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/messages';
    Querystring: { env: string };
    Body: {
        operationId: string;
        limit?: number;
        states?: SearchOperationsState[];
        search?: string | undefined;
        cursorBefore?: string | null | undefined;
        cursorAfter?: string | null | undefined;
    };
    Success: {
        data: MessageRow[];
        pagination: { total: number; cursorBefore: string | null; cursorAfter: string | null };
    };
}>;
export type SearchMessagesData = SearchMessages['Success']['data'][0];

export type SearchFilters = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/filters';
    Querystring: { env: string };
    Body: { category: 'integration' | 'syncConfig' | 'connection'; search?: string | undefined };
    Success: {
        data: { key: string; doc_count: number }[];
    };
}>;
export type SearchFiltersData = SearchMessages['Success']['data'][0];

export type PostInsights = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/insights';
    Querystring: { env: string };
    Body: {
        type: 'action' | 'sync' | 'proxy' | 'webhook_external';
    };
    Success: {
        data: {
            histogram: InsightsHistogramEntry[];
        };
    };
}>;
export interface InsightsHistogramEntry {
    key: string;
    total: number;
    success: number;
    failure: number;
}
