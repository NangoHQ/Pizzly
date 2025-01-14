import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import type { Provider, ProviderAlias } from '@nangohq/types';
import { projectRoot } from './path.js';

let providers: Record<string, Provider> | undefined = undefined;

export function getProviders() {
    if (!providers) {
        providers = loadProvidersYaml();
    }

    return providers;
}

export function getProvider(providerName: string): Provider | null {
    const providers = getProviders();
    return providers?.[providerName] ?? null;
}

function getProvidersPath() {
    // find the providers.yaml file
    // recursively searching in parent directories
    const findProvidersYaml = (dir: string): string => {
        const providersYamlPath = path.join(dir, 'providers.yaml');
        if (fs.existsSync(providersYamlPath)) {
            return providersYamlPath;
        }
        const parentDir = path.dirname(dir);
        if (parentDir === dir) {
            throw new Error('providers_yaml_not_found');
        }
        return findProvidersYaml(parentDir);
    };
    return findProvidersYaml(projectRoot);
}

function loadProvidersYaml(): Record<string, Provider> | undefined {
    try {
        const fileEntries = yaml.load(fs.readFileSync(getProvidersPath()).toString()) as Record<string, Provider | ProviderAlias>;

        if (fileEntries == null) {
            throw new Error('provider_template_loading_failed');
        }

        for (const key in fileEntries) {
            const entry = fileEntries[key];

            if (entry && 'alias' in entry) {
                if (Object.keys(entry).length <= 0) {
                    console.error('Failed to find alias', entry.alias);
                    continue;
                }

                const { alias, ...overrides } = entry;
                const aliasData = fileEntries[entry.alias] as Provider;
                fileEntries[key] = { ...aliasData, ...overrides };
            }
        }

        return fileEntries as Record<string, Provider>;
    } catch (err) {
        console.error('Failed to load providers.yaml', err);
    }
    return;
}