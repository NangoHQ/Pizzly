import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import type { ApiInvitation, WebUser } from '@nangohq/types';
import { useTeam } from '../../hooks/useTeam';
import { useStore } from '../../store';
import * as Table from '../../components/ui/Table';

export const columns: ColumnDef<WebUser | ApiInvitation>[] = [
    {
        accessorKey: 'name',
        header: 'Name',
        size: 180,
        cell: ({ row }) => {
            return <div className="truncate text-sm">{row.original.name || '-'}</div>;
        }
    },
    {
        accessorKey: 'email',
        header: 'Email',
        size: 180,
        cell: ({ row }) => {
            return <div className="truncate text-sm">{row.original.email || '-'}</div>;
        }
    },
    {
        accessorKey: 'created_at',
        header: '',
        size: 180,
        cell: ({ row }) => {
            if (!('created_at' in row.original)) {
                return null;
            }
            return 'invited';
        }
    },
    {
        accessorKey: 'id',
        header: '',
        size: 100,
        cell: ({ row }) => {
            if (!('created_at' in row.original)) {
                return 'member';
            }
            return 'invited';
        }
    }
];

export const TeamUsers: React.FC = () => {
    const env = useStore((state) => state.env);
    const { users, invitedUsers } = useTeam(env);

    const table = useReactTable({
        data: users && invitedUsers ? [...users, ...invitedUsers] : [],
        columns,
        getCoreRowModel: getCoreRowModel()
    });

    if (!users) {
        return null;
    }

    return (
        <div className="flex flex-col gap-5">
            <h3 className="font-semibold text-sm text-white">Team Members</h3>

            <Table.Table className="table-fixed">
                <Table.Header>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <Table.Row key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                                return (
                                    <Table.Head
                                        key={header.id}
                                        style={{
                                            width: header.getSize() !== 0 ? header.getSize() : undefined
                                        }}
                                    >
                                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                    </Table.Head>
                                );
                            })}
                        </Table.Row>
                    ))}
                </Table.Header>
                <Table.Body>
                    {table.getRowModel().rows?.length > 0 &&
                        table.getRowModel().rows.map((row) => {
                            return (
                                <Table.Row key={row.id}>
                                    {row.getVisibleCells().map((cell) => (
                                        <Table.Cell bordered className="text-white" key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </Table.Cell>
                                    ))}
                                </Table.Row>
                            );
                        })}
                </Table.Body>
            </Table.Table>
        </div>
    );
};
