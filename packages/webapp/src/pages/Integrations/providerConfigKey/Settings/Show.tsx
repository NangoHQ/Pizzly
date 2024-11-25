import type { GetIntegration } from '@nangohq/types';
import { SettingsGeneral } from './components/General';
import { SettingsOAuth, settingsMissingOAuth } from './components/OAuth';
import { useStore } from '../../../../store';
import { useEnvironment } from '../../../../hooks/useEnvironment';
import type { EnvironmentAndAccount } from '@nangohq/server';
import { SettingsApp, settingsMissingApp } from './components/App';
import { SettingsCustom, settingsMissingCustom } from './components/Custom';
import { SettingsDefault } from './components/Default';

export const SettingsSwitch: React.FC<{ data: GetIntegration['Success']['data']; environment: EnvironmentAndAccount['environment'] }> = ({
    data,
    environment
}) => {
    switch (data.template.auth_mode) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'TBA':
            return <SettingsOAuth data={data} environment={environment} />;

        case 'APP':
            return <SettingsApp data={data} environment={environment} />;

        case 'CUSTOM':
            return <SettingsCustom data={data} environment={environment} />;

        case 'BASIC':
        case 'API_KEY':
        case 'APP_STORE':
        case 'TABLEAU':
        case 'NONE':
        case 'OAUTH2_CC':
            return <SettingsDefault data={data} environment={environment} />;

        default:
            return <div>Unsupported</div>;
    }
};

const missingFieldsMessage = (data: GetIntegration['Success']['data']): string | null => {
    switch (data.template.auth_mode) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'TBA':
            return settingsMissingOAuth(data.integration.missing_fields);

        case 'APP':
            return settingsMissingApp(data.integration.missing_fields);

        case 'CUSTOM':
            return settingsMissingCustom(data.integration.missing_fields);

        case 'BASIC':
        case 'API_KEY':
        case 'APP_STORE':
        case 'TABLEAU':
        case 'NONE':
        case 'OAUTH2_CC':
            return null;

        default:
            return null;
    }
};

export const SettingsShow: React.FC<{ data: GetIntegration['Success']['data'] }> = ({ data }) => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount, loading } = useEnvironment(env);

    if (loading || !environmentAndAccount) {
        return null;
    }

    return (
        <div>
            <SettingsGeneral data={data} environment={environmentAndAccount.environment} missingFieldsMessage={missingFieldsMessage(data)} />
            <SettingsSwitch data={data} environment={environmentAndAccount.environment} />
        </div>
    );
};
