import type { Config as ProviderConfig } from './../../../models/Provider.js';
import type { InternalNango } from './internal-nango.js';

export type WebhookHandler = (
    internalNango: InternalNango,
    integration: ProviderConfig,
    headers: Record<string, any>,
    body: any,
    rawBody: string
) => Promise<WebhookResponse>;

export type WebhookResponse = {
    acknowledgementResponse?: unknown;
    parsedBody?: unknown;
} | void;

export type WebhookHandlersMap = Record<string, WebhookHandler>;
