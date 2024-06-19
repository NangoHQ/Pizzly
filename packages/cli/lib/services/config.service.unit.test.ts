import path from 'node:path';
import yaml from 'js-yaml';
import stripAnsi from 'strip-ansi';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadValidateParse, validateYaml } from './config.service';
import { NangoError } from '@nangohq/shared';

function cleanLog(log: any) {
    return typeof log === 'string' ? stripAnsi(log) : log;
}
describe('load', () => {
    // Not the best but until we have a logger it will work
    const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    afterEach(() => {
        consoleMock.mockReset();
    });

    it('should parse a nango.yaml file that is version 1 as expected', () => {
        const { response } = loadValidateParse(path.resolve(__dirname, `../../fixtures/nango-yaml/v1/valid`));
        expect(response!.parsed).toMatchSnapshot();
        expect(response!.parsed).not.toBeNull();
    });

    it('should parse a nango.yaml file that is version 2 as expected', () => {
        const { response } = loadValidateParse(path.resolve(__dirname, `../../fixtures/nango-yaml/v2/valid`));
        expect(response!.parsed).toMatchSnapshot();
        expect(response!.parsed).not.toBeNull();
    });

    it('should throw a validation error on a nango.yaml file that is not formatted correctly -- missing endpoint', () => {
        const acc: string[] = [];
        consoleMock.mockImplementation((m) => acc.push(cleanLog(m)));

        const { response, error } = loadValidateParse(path.resolve(__dirname, `../../fixtures/nango-yaml/v2/invalid.1`));
        expect(response!.parsed).toBeNull();
        expect(error).toBeDefined();
        expect(error).toStrictEqual(new NangoError('failed_to_parse_nango_yaml'));
        expect(acc.join('')).toContain('An endpoint property is required to specify how to retrieve the data from the sync');
    });

    it('should throw a validation error on a nango.yaml file that is not formatted correctly -- webhook subscriptions are not allowed in an action', () => {
        const acc: string[] = [];
        consoleMock.mockImplementation((m) => acc.push(stripAnsi(m)));

        const { response, error } = loadValidateParse(path.resolve(__dirname, `../../fixtures/nango-yaml/v2/invalid.2`));
        expect(response!.parsed).toBeNull();
        expect(response!.parsed).toBeDefined();
        expect(error).toStrictEqual(new NangoError('failed_to_parse_nango_yaml'));
        expect(acc.join('')).toContain('additionalProperty: webhook-subscription');
    });
});

describe('validate', () => {
    it('should validate empty yaml', () => {
        const res = validateYaml(yaml.load(``));
        expect(res).toStrictEqual([
            {
                msg: 'Invalid file format, you should have at least an `integrations` property at the root level. Check our documentation https://docs.nango.dev/reference/integration-configuration'
            }
        ]);
    });

    it('should require sync to be object', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    syncs:
      foobar:
`)
        );
        expect(res).toStrictEqual([
            {
                code: 'type',
                msg: 'must be object',
                params: { type: 'object' },
                path: '/integrations/test/syncs/foobar'
            }
        ]);
    });

    it('should require some fields in sync', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    syncs:
      foobar:
        input: boolean
        runs: every day
`)
        );
        expect(res).toMatchObject([
            {
                msg: 'An endpoint property is required to specify how to retrieve the data from the sync.',
                path: '/integrations/test/syncs/foobar'
            },
            {
                msg: 'An output property is required to specify what is the outcome of the sync.',
                path: '/integrations/test/syncs/foobar'
            }
        ]);
    });

    it('should disallow extra properties', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    syncs:
      foobar:
        runs: every day
        endpoint: GET /test
        output: boolean
        iinput: boolean
`)
        );
        expect(res).toStrictEqual([
            {
                code: 'additionalProperties',
                msg: 'must NOT have additional properties',
                params: { additionalProperty: 'iinput' },
                path: '/integrations/test/syncs/foobar'
            }
        ]);
    });

    it('should enforce endpoint format', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    syncs:
      foobar:
        runs: every day
        endpoint: /te df /+-st
        output: boolean
`)
        );
        expect(res).toMatchObject([
            {
                msg: 'endpoint must be a URL (or an array of URLs) with an HTTP verb, i.e: "GET /tickets/ticket"',
                path: '/integrations/test/syncs/foobar/endpoint'
            }
        ]);
    });

    it('should prevent incorrect HTTP verb for sync endpoint ', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    sync:
      foobar:
        endpoint: DELETE /test
        output: boolean
`)
        );
        expect(res).toMatchObject([]);
    });

    it('should allow endpoint format for action', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    actions:
      foobar:
        endpoint: DELETE /test
        output: boolean
`)
        );
        expect(res).toMatchObject([]);
    });
});
