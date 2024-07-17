import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiAcceptInvite, apiDeclineInvite, useInvite } from '../../hooks/useInvite';
import DefaultLayout from '../../layout/DefaultLayout';
import { Skeleton } from '../../components/ui/Skeleton';
import Info from '../../components/ui/Info';
import Button from '../../components/ui/button/Button';
import { useState } from 'react';
import { useToast } from '../../hooks/useToast';

export const InviteSignup: React.FC = () => {
    const { token } = useParams();
    const { toast } = useToast();
    const navigate = useNavigate();

    const { data, error, loading } = useInvite(token);
    const [loadingDecline, setLoadingDecline] = useState(false);
    const [loadingAccept, setLoadingAccept] = useState(false);

    const onAccept = async () => {
        setLoadingAccept(true);

        const accepted = await apiAcceptInvite(token!);
        if (accepted && accepted.res.status === 200) {
            toast({ title: `You joined the team`, variant: 'success' });
            navigate('/');
        } else {
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        }
        setLoadingAccept(false);
    };
    const onDecline = async () => {
        setLoadingDecline(true);

        const declined = await apiDeclineInvite(token!);
        if (declined && declined.res.status === 200) {
            toast({ title: `You declined the invitation`, variant: 'success' });
            navigate('/');
        } else {
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        }
        setLoadingDecline(false);
    };

    if (loading) {
        return (
            <DefaultLayout>
                <div className="flex flex-col justify-center">
                    <div className="flex flex-col justify-center w-80 mt-4">
                        <Skeleton className="w-100%" />
                    </div>
                </div>
            </DefaultLayout>
        );
    }

    if (error) {
        return (
            <DefaultLayout>
                <div className="flex flex-col justify-center">
                    <div className="flex flex-col justify-center w-80 mt-4">
                        {error.error.code === 'not_found' ? (
                            <div className="flex flex-col items-center gap-4">
                                <Info color={'blue'} classNames="text-xs" size={20}>
                                    This invitation does not exists or is expired
                                </Info>
                                <Link to={'/signup'}>
                                    <Button>Go back to signup</Button>
                                </Link>
                            </div>
                        ) : (
                            <Info color={'red'} classNames="text-xs" size={20}>
                                An error occurred, refresh your page or reach out to the support.{' '}
                                {error.error.code === 'generic_error_support' && (
                                    <>
                                        (id: <span className="select-all">{error.error.payload}</span>)
                                    </>
                                )}
                            </Info>
                        )}
                    </div>
                </div>
            </DefaultLayout>
        );
    }
    if (!data) {
        return null;
    }

    return (
        <DefaultLayout>
            <div className="flex flex-col justify-center">
                <div className="flex flex-col justify-center mx-4 gap-4">
                    <h2 className="text-3xl font-semibold text-white text-center">Join a team</h2>
                    <div className="text-text-light-gray text-sm text-center">
                        <p>
                            {data.invitedBy.name} has invited you to transfer to a new team: <strong className="text-white">{data.newTeam.name}</strong> (
                            {data.newTeamUsers} {data.newTeamUsers > 1 ? 'members' : 'member'})
                        </p>{' '}
                        <p>If you accept, you will permanently lose access to your existing team.</p>
                    </div>
                    <div className="flex gap-2 mt-6 items-center justify-center">
                        <Button variant={'zinc'} onClick={onDecline} disabled={loadingAccept} isLoading={loadingDecline}>
                            Cancel
                        </Button>
                        <Button variant={'danger'} onClick={onAccept} disabled={loadingDecline} isLoading={loadingAccept}>
                            Join new team
                        </Button>
                    </div>
                </div>
            </div>
        </DefaultLayout>
    );
};
