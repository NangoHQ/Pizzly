/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import type { Endpoint } from '../api';
import type { MessageOperation, MessageRow, MessageState, OperationRow } from './messages';

type Concat<T extends MessageOperation> = T[keyof T] | (T extends { action: string } ? `${T['type']}:${T['action']}` : never);

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
        period?: SearchOperationsPeriod;
    };
    Success: {
        data: OperationRow[];
        pagination: { total: number };
    };
}>;
export type SearchOperationsState = 'all' | MessageState;
export type SearchOperationsType = 'all' | Concat<MessageOperation>;
export type SearchOperationsIntegration = 'all' | string;
export type SearchOperationsConnection = 'all' | string;
export type SearchOperationsSync = 'all' | string;
export interface SearchOperationsPeriod {
    before: string;
    after: string;
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
    Body: { operationId: string; limit?: number; states?: SearchOperationsState[]; search?: string | undefined };
    Success: {
        data: MessageRow[];
        pagination: { total: number };
    };
}>;
export type SearchMessagesData = SearchMessages['Success']['data'][0];

export type SearchFilters = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/filters';
    Querystring: { env: string };
    Body: { category: 'config' | 'syncConfig' | 'connection'; search?: string | undefined };
    Success: {
        data: { key: string; doc_count: number }[];
    };
}>;
export type SearchFiltersData = SearchMessages['Success']['data'][0];
