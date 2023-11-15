import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { Link } from 'react-router-dom';
import { Briefcase, User } from '@geist-ui/icons';
import {
    SquaresPlusIcon,
    BuildingOfficeIcon,
    QueueListIcon,
    AdjustmentsHorizontalIcon,
    EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline'

import { useStore } from '../store';
import { isCloud } from '../utils/utils';
import { useSignout } from '../utils/user';

export enum LeftNavBarItems {
    Integrations = 0,
    Connections,
    ProjectSettings,
    Activity,
    Syncs,
    AccountSettings,
    UserSettings,
    GettingStarted
}

export interface LeftNavBarProps {
    selectedItem: LeftNavBarItems;
}

const navTextColor = 'text-gray-400';
const navActiveBg = 'bg-zinc-900';
const navHoverBg = 'hover:bg-neutral-800';

export default function LeftNavBar(props: LeftNavBarProps) {
    const [envs, setEnvs] = useState<{ name: string; }[]>([]);
    const [version, setVersion] = useState<string>('');
    const [email, setEmail] = useState<string>('');

    const signout = useSignout();

    useEffect(() => {
        fetch('/api/v1/meta')
            .then(res => {
                if(res.status === 401) {
                    return signout();
                }
                return res.json();
            })
            .then(data => {
                if(!data) return;
                setEnvs(data.environments);
                setVersion(data.version);
                setEmail(data.email);
            })
            .catch(err => {
                console.error(err);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const env = useStore(state => state.cookieValue);
    console.log(version)

    const setCookieValue = useStore(state => state.setCookieValue);

    const handleEnvChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newEnv = e.target.value;
        Cookies.set('env', newEnv);
        setCookieValue(newEnv);
        // if on certain subpages redirect to the parent page since the entity
        // is environment specific
        if (window.location.pathname.includes('integration') && window.location.pathname.split('/').length > 2) {
            window.location.href = '/integrations';
        }

        if (window.location.pathname.includes('connections') && window.location.pathname.split('/').length > 2) {
            window.location.href = '/connections';
        }
    }

    return (
        <div>
            <div className="h-full pt-14 border-r-2 border-t-2 border-border-gray flex flex-col w-60 fixed bg-bg-black z-20 justify-between">
                <div className="mt-8 px-6">
                    {envs.length === 0 && (
                        <div className="mb-8">
                            <select className="border-border-gray bg-bg-black text-text-light-gray block w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"></select>
                        </div>
                    )}
                    {envs.length > 0 && (
                        <div className="mb-8">
                            <select
                                id="environment"
                                name="env"
                                className="border-border-gray bg-bg-black text-text-light-gray block w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                onChange={handleEnvChange}
                                value={env}
                            >
                                {envs.map((env) => (
                                    <option key={env.name} value={env.name}>
                                        {env.name.slice(0, 1).toUpperCase() + env.name.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="space-y-1">
                        {env === 'dev' && (
                            <Link
                                to="/getting-started"
                                className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                    props.selectedItem === LeftNavBarItems.GettingStarted ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                                }`}
                            >
                                <img className="h-5" src="/images/rocket-icon.svg" alt="" />
                                <p>Getting Started</p>
                            </Link>
                        )}
                        <Link
                            to="/integrations"
                            className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.Integrations ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <SquaresPlusIcon className="flex h-5 w-5 text-white" />
                            <p>Integrations</p>
                        </Link>
                        <Link
                            to="/connections"
                            className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.Connections ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <BuildingOfficeIcon className="flex h-5 w-5 text-white" />
                            <p>Connections</p>
                        </Link>
                        <Link
                            to="/activity"
                            className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.Activity ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <QueueListIcon className="flex h-5 w-5 text-white" />
                            <p>Activity</p>
                        </Link>
                        <Link
                            to="/project-settings"
                            className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm ${navTextColor} ${
                                props.selectedItem === LeftNavBarItems.ProjectSettings ? `${navActiveBg} text-white` : `text-gray-400 ${navHoverBg}`
                            }`}
                        >
                            <AdjustmentsHorizontalIcon className="flex h-5 w-5 text-white" />
                            <p>Settings</p>
                        </Link>
                    </div>
                </div>
                <div className='px-6'>
                    {isCloud() && (
                        <div className="">
                            <ul className="text-white space-y-1 text-sm">
                                <li>
                                    <Link
                                        to="/account-settings"
                                        className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm text-white ${
                                            props.selectedItem === LeftNavBarItems.AccountSettings ? 'bg-gray-800' : 'hover:bg-gray-700'
                                        }`}
                                    >
                                        <Briefcase className="h-5" />
                                        Account Settings
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        to="/user-settings"
                                        className={`flex h-10 p-2 gap-x-3 items-center rounded-md text-sm text-white ${
                                            props.selectedItem === LeftNavBarItems.UserSettings ? 'bg-gray-800' : 'hover:bg-gray-700'
                                        }`}
                                    >
                                        <User className="h-5" />
                                        User Settings
                                    </Link>
                                </li>
                            </ul>
                        </div>
                    )}
                    {email && (
                        <div className="flex py-8 items-center">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-transparent text-sm border border-gray-400 text-gray-400 mr-3">
                                {email.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="items-center text-center text-gray-400 justify-center text-sm truncate">
                                {email}
                            </span>
                            <EllipsisHorizontalIcon className="flex h-5 w-5 ml-3 text-gray-400 cursor-pointer" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
