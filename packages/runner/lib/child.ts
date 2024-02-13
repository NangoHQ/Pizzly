import type { NangoProps, RunnerOutput } from '@nangohq/shared';
import { ActionError, NangoSync, NangoAction } from '@nangohq/shared';
import { Buffer } from 'buffer';
import * as vm from 'vm';
import * as url from 'url';
import * as crypto from 'crypto';
import * as zod from 'zod';

interface ExecProps {
    nangoProps: NangoProps;
    isInvokedImmediately: boolean;
    isWebhook: boolean;
    code: string;
    codeParams?: object;
}

async function exec(nangoProps: NangoProps, isInvokedImmediately: boolean, isWebhook: boolean, code: string, codeParams?: object): Promise<RunnerOutput> {
    const isAction = isInvokedImmediately && !isWebhook;
    const nango = isAction ? new NangoAction(nangoProps) : new NangoSync(nangoProps);
    const wrappedCode = `
                (function() {
                    var module = { exports: {} };
                    var exports = module.exports;
                    ${code}
                    return module.exports;
                })();
            `;

    try {
        const script = new vm.Script(wrappedCode);
        const sandbox = {
            console,
            require: (moduleName: string) => {
                switch (moduleName) {
                    case 'url':
                        return url;
                    case 'crypto':
                        return crypto;
                    case 'zod':
                        return zod;
                    default:
                        throw new Error(`Module '${moduleName}' is not allowed`);
                }
            },
            Buffer,
            setTimeout
        };
        const context = vm.createContext(sandbox);
        const scriptExports = script.runInContext(context);
        if (isWebhook) {
            if (!scriptExports.onWebhookPayloadReceived) {
                const content = `There is no onWebhookPayloadReceived export for ${nangoProps.syncId}`;

                throw new Error(content);
            }

            return await scriptExports.onWebhookPayloadReceived(nango, codeParams);
        } else {
            if (!scriptExports.default || typeof scriptExports.default !== 'function') {
                throw new Error(`Default exports is not a function but a ${typeof scriptExports.default}`);
            }
            if (isAction) {
                return await scriptExports.default(nango, codeParams);
            } else {
                return await scriptExports.default(nango);
            }
        }
    } catch (error: any) {
        if (error instanceof ActionError) {
            const { type, payload } = error;
            return {
                success: false,
                error: {
                    type,
                    payload
                },
                response: null
            };
        } else {
            throw new Error(`Error executing code '${error}'`);
        }
    }
}

process.on('message', async (message: ExecProps) => {
    const { nangoProps, isInvokedImmediately, isWebhook, code, codeParams } = message;

    if (!process || !process.send) {
        throw new Error('No process or process.send');
    }

    try {
        const result = await exec(nangoProps, isInvokedImmediately, isWebhook, code, codeParams);
        process.send({ result });
    } catch (error: any) {
        process.send({ error: error.message });
    }
});
