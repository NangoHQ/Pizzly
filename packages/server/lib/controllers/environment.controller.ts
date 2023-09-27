import type { Request, Response, NextFunction } from 'express';
import { hmacService, environmentService, errorManager, getBaseUrl, isCloud, getWebsocketsPath, getOauthCallbackUrl, getEnvironmentId } from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';

class EnvironmentController {
    async listEnvironments(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { account } = response;

            const environments = await environmentService.getEnvironmentsByAccountId(account.id);
            res.status(200).send({ environments });
        } catch (err) {
            next(err);
        }
    }

    async getEnvironment(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            if (!isCloud()) {
                environment.websockets_path = getWebsocketsPath();
                if (process.env[`NANGO_SECRET_KEY_${environment.name.toUpperCase()}`]) {
                    environment.secret_key = process.env[`NANGO_SECRET_KEY_${environment.name.toUpperCase()}`] as string;
                }

                if (process.env[`NANGO_PUBLIC_KEY_${environment.name.toUpperCase()}`]) {
                    environment.public_key = process.env[`NANGO_PUBLIC_KEY_${environment.name.toUpperCase()}`] as string;
                }
            }

            environment.callback_url = await getOauthCallbackUrl(environment.id);

            const environmentVariables = await environmentService.getEnvironmentVariables(environment.id);

            res.status(200).send({ account: { ...environment, env_variables: environmentVariables, host: getBaseUrl() } });
        } catch (err) {
            next(err);
        }
    }

    async getHmacDigest(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;
            const { provider_config_key: providerConfigKey, connection_id: connectionId } = req.query;

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_provider_config_key');
                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
                return;
            }

            if (environment.hmac_enabled && environment.hmac_key) {
                const digest = await hmacService.digest(environment.id, providerConfigKey as string, connectionId as string);
                res.status(200).send({ hmac_digest: digest });
            } else {
                res.status(200).send({ hmac_digest: null });
            }
        } catch (err) {
            next(err);
        }
    }

    async updateCallback(req: Request, res: Response, next: NextFunction) {
        try {
            if (req.body == null) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            if (req.body['callback_url'] == null) {
                errorManager.errRes(res, 'missing_callback_url');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editCallbackUrl(req.body['callback_url'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateWebhookURL(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editWebhookUrl(req.body['webhook_url'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateHmacEnabled(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editHmacEnabled(req.body['hmac_enabled'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateHmacKey(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editHmacKey(req.body['hmac_key'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async getEnvironmentVariables(_req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            const environmentVariables = await environmentService.getEnvironmentVariables(environmentId);
            res.status(200).send(environmentVariables);
        } catch (err) {
            next(err);
        }
    }

    async updateEnvironmentVariables(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editEnvironmentVariable(environment.id, req.body);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async rotateKey(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            if (!req.body.type) {
                res.status(400).send({ error: 'The type of key to rotate is required' });
                return;
            }
            const { environment } = response;

            const newKey = await environmentService.rotateKey(environment.id, req.body.type);
            res.status(200).send({ key: newKey });
        } catch (err) {
            next(err);
        }
    }
}

export default new EnvironmentController();
