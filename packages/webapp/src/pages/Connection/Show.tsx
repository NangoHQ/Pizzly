import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import type React from 'react';
import { useState, useEffect } from 'react';
import { useSWRConfig } from 'swr';
import { unstable_serialize } from 'swr/infinite';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../components/ui/Dialog';

import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import { Info } from '../../components/Info';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import Button from '../../components/ui/button/Button';
import { useEnvironment } from '../../hooks/useEnvironment';
import { Syncs } from './Syncs';
import { Authorization } from './Authorization';
import { isHosted } from '../../utils/utils';
import { connectSlack } from '../../utils/slack-connection';

import { useStore } from '../../store';
import { apiDeleteConnection, useConnection } from '../../hooks/useConnections';
import { useLocalStorage } from 'react-use';
import { Skeleton } from '../../components/ui/Skeleton';
import { useSyncs } from '../../hooks/useSyncs';
import { ErrorPageComponent } from '../../components/ErrorComponent';
import { AvatarOrganization } from '../../components/AvatarCustom';
import { IconTrash } from '@tabler/icons-react';
import { useToast } from '../../hooks/useToast';
import { useListIntegration } from '../../hooks/useIntegration';

export enum Tabs {
    Syncs,
    Authorization
}

export const ConnectionShow: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { mutate, cache } = useSWRConfig();
    const { toast } = useToast();
    const { connectionId, providerConfigKey } = useParams();
    const [showSlackBanner, setShowSlackBanner] = useLocalStorage(`nango:connection:slack_banner_show`, true);

    const env = useStore((state) => state.env);

    const { environmentAndAccount, mutate: environmentMutate } = useEnvironment(env);

    const [slackIsConnecting, setSlackIsConnecting] = useState(false);
    const [activeTab, setActiveTab] = useState<Tabs>(Tabs.Syncs);
    const [slackIsConnected, setSlackIsConnected] = useState(true);
    const { data: connection, error, loading } = useConnection({ env, provider_config_key: providerConfigKey! }, { connectionId: connectionId! });
    const { data: syncs, error: errorSyncs, loading: loadingSyncs } = useSyncs({ env, provider_config_key: providerConfigKey!, connection_id: connectionId! });
    const { mutate: listIntegrationMutate } = useListIntegration(env);

    // Modal delete
    const [open, setOpen] = useState(false);
    const [loadingDelete, setLoadingDelete] = useState(false);

    useEffect(() => {
        if (environmentAndAccount) {
            setSlackIsConnected(environmentAndAccount.environment.slack_notifications);
        }
    }, [environmentAndAccount]);

    useEffect(() => {
        if (location.hash === '#models' || location.hash === '#syncs') {
            setActiveTab(Tabs.Syncs);
        }
        if (location.hash === '#authorization' || isHosted()) {
            setActiveTab(Tabs.Authorization);
        }
    }, [location]);

    const onDelete = async () => {
        if (!connectionId || !providerConfigKey) {
            return;
        }

        setLoadingDelete(true);
        const res = await apiDeleteConnection({ connectionId }, { provider_config_key: providerConfigKey, env });
        setLoadingDelete(false);

        void listIntegrationMutate();

        if (res.res.status === 200) {
            toast({ title: `Connection deleted!`, variant: 'success' });

            // Both are mandatory because SWR is bad
            // Since 2021 https://github.com/vercel/swr/issues?q=is%3Aissue+infinite+cache
            await mutate(
                unstable_serialize(() => '/api/v1/connections?env=dev&page=0'),
                undefined,
                { revalidate: false }
            );
            for await (const key of cache.keys()) {
                if (key.startsWith('/api/v1/connections')) {
                    cache.delete(key);
                }
            }

            navigate(`/${env}/connections`, { replace: true });
        } else {
            toast({ title: `Failed to delete connection`, variant: 'error' });
        }
    };

    const createSlackConnection = async () => {
        setSlackIsConnecting(true);
        if (!environmentAndAccount) return;
        const { uuid: accountUUID, host: hostUrl } = environmentAndAccount;
        const onFinish = () => {
            void environmentMutate();
            toast({ title: `Slack connection created!`, variant: 'success' });
            setSlackIsConnecting(false);
        };

        const onFailure = () => {
            toast({ title: `Failed to create Slack connection!`, variant: 'error' });
            setSlackIsConnecting(false);
        };
        await connectSlack({ accountUUID, env, hostUrl, onFinish, onFailure });
    };

    if (loading || loadingSyncs) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
                <div className="flex gap-4 justify-between">
                    <div className="flex gap-6">
                        <div className="shrink-0">
                            <div className="w-[80px] h-[80px] p-5 border border-border-gray rounded-xl">
                                <Skeleton className="w-[40px] h-[40px]" />
                            </div>
                        </div>
                        <div className="my-3 flex flex-col gap-4">
                            <div className="text-left text-lg font-semibold text-gray-400">
                                <Skeleton className="w-[150px]" />
                            </div>
                            <div className="flex gap-4 items-center">
                                <Skeleton className="w-[250px]" />
                            </div>
                        </div>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return <ErrorPageComponent title="Connection" error={error || errorSyncs} page={LeftNavBarItems.TeamSettings} />;
    }

    if (!connection || !syncs) {
        return null;
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            <div className="mx-auto">
                <div className="flex gap-4 justify-between">
                    <div className="flex gap-6">
                        <div className="relative">
                            <Link to={`/${env}/integrations/${connection.connection.provider_config_key}`}>
                                <div className="shrink-0">
                                    <div className="w-[80px] h-[80px] p-4 border border-border-gray rounded-xl">
                                        {connection.provider && <IntegrationLogo provider={connection.provider} height={16} width={16} />}
                                    </div>
                                </div>
                            </Link>

                            <div className="absolute -bottom-3 -right-3">
                                <AvatarOrganization
                                    size={'sm'}
                                    email={connection.endUser?.email ? connection.endUser.email : null}
                                    displayName={
                                        connection.endUser ? connection.endUser.displayName || connection.endUser.email : connection.connection.connection_id
                                    }
                                />
                            </div>
                        </div>

                        <div className="mt-3">
                            <span className="font-semibold tracking-tight text-gray-400">Connection</span>
                            {connection.endUser ? (
                                <div className="flex flex-col overflow-hidden">
                                    <h2 className="text-3xl font-semibold tracking-tight text-white break-all -mt-2">{connection.endUser.email}</h2>

                                    <div className="text-dark-500 text-xs font-code flex gap-2">
                                        {connection.endUser.displayName && <span>{connection.endUser.displayName}</span>}
                                        {connection.endUser.organization?.displayName && <span>({connection.endUser.organization?.displayName})</span>}
                                    </div>
                                </div>
                            ) : (
                                <h2 className="text-3xl font-semibold tracking-tight text-white break-all -mt-2">{connectionId}</h2>
                            )}
                        </div>
                    </div>

                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button variant={'emptyFaded'}>
                                <IconTrash stroke={1} size={18} /> Delete
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogTitle>Delete connection?</DialogTitle>
                            <DialogDescription>All credentials & synced data associated with this connection will be deleted.</DialogDescription>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant={'zinc'}>Cancel</Button>
                                </DialogClose>
                                <Button variant={'danger'} onClick={onDelete} isLoading={loadingDelete}>
                                    Delete
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <section className="mt-14">
                <ul className="flex text-gray-400 space-x-2 font-semibold text-sm cursor-pointer">
                    <li
                        className={`flex items-center p-2 rounded ${activeTab === Tabs.Syncs ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                        onClick={() => setActiveTab(Tabs.Syncs)}
                    >
                        Syncs
                        {syncs.some((sync) => sync.active_logs?.log_id) && <span className="ml-2 bg-red-base h-1.5 w-1.5 rounded-full inline-block"></span>}
                    </li>
                    <li
                        className={`flex items-center p-2 rounded ${activeTab === Tabs.Authorization ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                        onClick={() => setActiveTab(Tabs.Authorization)}
                    >
                        Authorization
                        {connection.errorLog && <span className="ml-2 bg-red-base h-1.5 w-1.5 rounded-full inline-block"></span>}
                    </li>
                </ul>
            </section>

            {!slackIsConnected && !isHosted() && showSlackBanner && (
                <Info className="mt-4" onClose={() => setShowSlackBanner(false)} icon={<IntegrationLogo provider="slack" height={6} width={6} />}>
                    Receive instant monitoring alerts on Slack.{' '}
                    <button
                        disabled={slackIsConnecting}
                        onClick={createSlackConnection}
                        className={`ml-1 ${!slackIsConnecting ? 'cursor-pointer underline' : 'text-text-light-gray'}`}
                    >
                        Set up now for the {env} environment.
                    </button>
                </Info>
            )}

            <section className="mt-10">
                {activeTab === Tabs.Syncs && <Syncs syncs={syncs} connection={connection.connection} provider={connection.provider} />}
                {activeTab === Tabs.Authorization && (
                    <Authorization endUser={connection.endUser} connection={connection.connection} errorLog={connection.errorLog} />
                )}
            </section>
            <Helmet>
                <style>{'.no-border-modal footer { border-top: none !important; }'}</style>
            </Helmet>
        </DashboardLayout>
    );
};
