import { LeftNavBarItems } from '../../components/LeftNavBar';
import Info from '../../components/ui/Info';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTeam } from '../../hooks/useTeam';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { TeamInfo } from './Info';
import { TeamUsers } from './Users';

export const TeamSettings: React.FC = () => {
    const env = useStore((state) => state.env);

    const { error, loading } = useTeam(env);

    if (loading) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Logs}>
                <h2 className="text-3xl font-semibold text-white mb-16">Team Settings</h2>
                <div className="flex flex-col gap-4">
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Logs}>
                <h2 className="text-3xl font-semibold text-white mb-16">Team Settings</h2>
                <Info color={'red'} classNames="text-xs" size={20}>
                    An error occurred, refresh your page or reach out to the support.{' '}
                    {error.error.code === 'generic_error_support' && (
                        <>
                            (id: <span className="select-all">{error.error.payload}</span>)
                        </>
                    )}
                </Info>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.TeamSettings}>
            <h2 className="text-3xl font-semibold text-white mb-16">Team Settings</h2>
            <div className="flex flex-col gap-12">
                <TeamInfo />
                <TeamUsers />
            </div>
        </DashboardLayout>
    );
};
