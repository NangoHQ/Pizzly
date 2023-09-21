import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Prism } from '@mantine/prism';
import { useGetFlows, useCreateFlow } from '../utils/api';
import { Sync } from '../types';
import { LeftNavBarItems } from '../components/LeftNavBar';
import DashboardLayout from '../layout/DashboardLayout';
import { useStore } from '../store';

interface FlowDetails {
    type?: 'sync' | 'action';
    auto_start?: boolean;
    track_deletes?: boolean;
    returns: string[];
    runs: string;
}

interface Flow {
    [key: string]: FlowDetails | object;
    models: Record<string, unknown>;
}

interface Integration {
    [key: string]: Flow;
}

export default function FlowCreate() {
    const [loaded, setLoaded] = useState(false);
    const [integration, setIntegration] = useState<string>('');
    const [flows, setFlows] = useState<Integration>({});
    const [flowNames, setFlowNames] = useState<string[]>([]);
    const [flow, setFlow] = useState<FlowDetails>();
    const [models, setModels] = useState<Flow['models']>({});
    const [selectedFlowName, setSelectedFlowName] = useState<string>('');
    const [alreadyAddedFlows, setAlreadyAddedFlows] = useState<Sync[]>([]);
    const [canAdd, setCanAdd] = useState<boolean>(true);

    const [frequencyValue, setFrequencyValue] = useState<number>();
    const [frequencyUnit, setFrequencyUnit] = useState<string>();
    const [frequencyEditMode, setFrequencyEditMode] = useState(false);
    const getFlows = useGetFlows();
    const createFlow = useCreateFlow();
    const env = useStore(state => state.cookieValue);

    const navigate = useNavigate();

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getAvailableFlows = async () => {
            const res = await getFlows();

            if (res?.status === 200) {
                const { availableFlows: flows, addedFlows } = await res.json();
                setAlreadyAddedFlows(addedFlows);
                setFlows(flows.integrations);
                setIntegration(Object.keys(flows.integrations)[0]);
                setFlowNames(Object.keys(flows.integrations[Object.keys(flows.integrations)[0]]).filter(name => name !== 'models'));
                const flow = flows.integrations[Object.keys(flows.integrations)[0]][Object.keys(flows.integrations[Object.keys(flows.integrations)[0]])[0]] as FlowDetails;
                setFlow(flow);
                updateFrequency(flow.runs);
                setModels(flows.integrations[Object.keys(flows.integrations)[0]]['models']);
            }
        }
        if (!loaded) {
            setLoaded(true);
            getAvailableFlows();
        }
    }, [getFlows, loaded, updateFrequency]);

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());

        const models = showModels(flow?.returns as string[]) as any;
        const flowPayload = {
            integration: data['integration'].toString(),
            type: flow?.type === 'action' ? 'action' : 'sync',
            name: data['flow-name'].toString(),
            runs: `every ${data['frequency']} ${data['frequency-unit']}`,
            auto_start: data['auto-start'] === 'on',
            models: flow?.returns as string[],
            model_schema: JSON.stringify(Object.keys(models).map(model => ({
                name: model,
                fields: Object.keys(models[model]).map(field => ({
                    name: field,
                    type: models[model][field]
                }))
            }))),
            is_public: true
        };

        const res = await createFlow([flowPayload]);

        if (res?.status === 201) {
            toast.success(`${flowPayload.type} created successfully!`, { position: toast.POSITION.BOTTOM_CENTER });
            navigate('/syncs', { replace: true });
        } else if (res != null) {
            const payload = await res.json();
            toast.error(payload.error, {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }
    }

    const handleIntegrationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setFrequencyEditMode(false);
        setIntegration(e.target.value);
        const flowNamesWithModels = Object.keys(flows[e.target.value]);
        const flowNames = flowNamesWithModels.filter(name => name !== 'models');
        setFlowNames(flowNames);
        setSelectedFlowName(flowNames[0]);
        const alreadyAdded = alreadyAddedFlows.find((flow: Sync) => flow.unique_key === e.target.value && flow.sync_name === flowNames[0]);
        setCanAdd(alreadyAdded === undefined);
        const flow = flows[e.target.value][flowNames[0]] as FlowDetails;
        setFlow(flow);
        updateFrequency(flow.runs);
        setModels(flows[e.target.value]['models']);
    }

    const handleFlowNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setFrequencyEditMode(false);
        const flow = flows[integration][e.target.value] as FlowDetails;
        setSelectedFlowName(e.target.value);
        setFlow(flow);
        updateFrequency(flow.runs);
        setModels(flows[integration]['models']);

        const alreadyAdded = alreadyAddedFlows.find((flow: Sync) => flow.unique_key === integration && flow.sync_name === e.target.value);
        setCanAdd(alreadyAdded === undefined);
    }

    const handleUpdateFrequency = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const formElement = e.currentTarget.closest('form');
        if (!formElement) return;

        const formData = new FormData(formElement);
        const data = Object.fromEntries(formData.entries());
        const frequency = data['frequency'];
        const frequencyUnit = data['frequency-unit'];

        setFlow({
            ...flow,
            runs: `every ${frequency} ${frequencyUnit}`
        } as FlowDetails);

        setFrequencyEditMode(false);
    }

    const showModels = (returns: string[]) => {
        const builtModels = {} as Flow['models'];

        returns.forEach(returnedModel => {
            builtModels[returnedModel] = models[returnedModel];
        });

        return builtModels;
    }

    const matchDefaultFrequencyValue = (frequency: string): void => {
        const frequencyValue = frequency.match(/\d+/g)?.[0];

        setFrequencyValue(Number(frequencyValue));
    }

    const matchDefaultFrequencyUnit = (frequency: string): void => {
        const frequencyWithoutEvery = frequency.replace('every ', '');
        const frequencyWithoutNumber = frequencyWithoutEvery.replace(/\d+/g, '');
        const frequencyUnit = frequencyWithoutNumber.replace(/\s/g, '');

        let unit = '';

        switch (frequencyUnit) {
            case 'minutes':
            case 'minute':
            case 'min':
            case 'mins':
                unit = 'minutes';
            break;
            case 'hours':
            case 'hour':
            case 'hr':
            case 'hrs':
            case 'h':
                unit = 'hours';
            break;
            case 'days':
            case 'day':
            case 'd':
                unit ='days';
            break;
        }

        setFrequencyUnit(unit);
    }

    function updateFrequency(frequency: string) {
        matchDefaultFrequencyValue(frequency);
        matchDefaultFrequencyUnit(frequency);
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Syncs}>
            {flows && Object.keys(flows).length > 0 && (
                <div className="mx-auto w-largebox pb-40">
                    <h2 className="mx-20 mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Add New Flow</h2>
                    <div className="mx-20 h-fit border border-border-gray rounded-md text-white text-sm py-14 px-8">
                        <form className="space-y-6" onSubmit={handleSave} autoComplete="off">
                            <div>
                                <div>
                                    <div className="flex">
                                        <label htmlFor="integration" className="text-text-light-gray block text-sm font-semibold">
                                            Integration
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <select
                                            id="integration"
                                            name="integration"
                                            className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                            onChange={handleIntegrationChange}
                                            defaultValue={Object.keys(flows)[0]}
                                        >
                                            {Object.keys(flows).map((integration, index) => (
                                                <option key={index} value={integration}>{integration}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div>
                                    <div className="flex">
                                        <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                            Flow Name
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <select
                                            id="flow-name"
                                            name="flow-name"
                                            className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                            onChange={handleFlowNameChange}
                                            value={selectedFlowName}
                                        >
                                            {flowNames.map((flowName, index) => (
                                                <option key={index} value={flowName}>{flowName}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div>
                                    <div className="flex">
                                        <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                            Type
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <span className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white">{flow?.type === 'action' ? 'action' : 'sync'}</span>
                                    </div>
                                </div>
                            </div>
                            {flow?.type !== 'action' && (
                                <div>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                                Auto Start
                                            </label>
                                        </div>
                                        <div className="mt-1">
                                            <input
                                                id="auto-start"
                                                type="checkbox"
                                                name="auto-start"
                                                defaultChecked={flow?.auto_start !== false}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                            {flow?.type !== 'action' && (
                                <div>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                                Frequency
                                            </label>
                                        </div>
                                        <div className="flex mt-1">
                                            <div className={`${frequencyEditMode ? 'flex' : 'hidden'}`}>
                                                <input
                                                    id="frequency"
                                                    name="frequency"
                                                    type="number"
                                                    className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                                    value={frequencyValue}
                                                    onChange={(e) => setFrequencyValue(Number(e.target.value))}
                                                />
                                                <select
                                                    id="frequency-unit"
                                                    name="frequency-unit"
                                                    className="ml-4 border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                                    value={frequencyUnit}
                                                    onChange={(e) => setFrequencyUnit(e.target.value)}
                                                >
                                                    <option value="minutes">Minutes</option>
                                                    <option value="hours">Hours</option>
                                                    <option value="days">Days</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                    onClick={handleUpdateFrequency}
                                                >
                                                    Update
                                                </button>
                                            </div>
                                            <div className={`${frequencyEditMode ? 'hidden' : 'flex w-1/3'}`}>
                                                <span className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white">{flow?.runs}</span>
                                                <button
                                                    type="button"
                                                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                                        e.preventDefault();
                                                        setFrequencyEditMode(true);
                                                    }}
                                                    className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {flow?.returns && (
                                <div>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                                Model{flow?.returns?.length > 1 ? 's' : ''}
                                            </label>
                                        </div>
                                        <Prism language="json" colorScheme="dark">
                                            {JSON.stringify(showModels(flow.returns), null, 2)}
                                        </Prism>
                                    </div>
                                </div>
                            )}
                            {canAdd !== false ? (
                                <div>
                                    <div className="flex justify-between">
                                        <button type="submit" className="bg-white mt-4 h-8 rounded-md hover:bg-gray-300 border px-3 pt-0.5 text-sm text-black">
                                            Add {flow?.type === 'action' ? 'Action' : 'Sync'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <span className="flex mt-2 text-red-500">This flow has already been added!</span>
                            )}
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
