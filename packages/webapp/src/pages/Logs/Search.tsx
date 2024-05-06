import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import Info from '../../components/ui/Info';
import { Loading } from '@geist-ui/core';
import { useSearchLogs } from '../../hooks/useLogs';
import { Input } from '../../components/ui/input/Input';
import * as Table from '../../components/ui/Table';
import { getCoreRowModel, useReactTable, flexRender } from '@tanstack/react-table';

import { MultiSelect } from './MultiSelect';
import { columns, statusOptions } from './constants';
import { useState } from 'react';
import type { SearchLogsState } from '@nangohq/types';

export const LogsSearch: React.FC = () => {
    const env = useStore((state) => state.env);

    // Data fetch
    const [states, setStates] = useState<SearchLogsState[]>(['all']);
    const { data, error, loading } = useSearchLogs(env, { limit: 20, states });

    const table = useReactTable({
        data: data ? data.data : [],
        columns,
        getCoreRowModel: getCoreRowModel()
    });

    if (error) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Logs} marginBottom={60}>
                <Info color="red" classNames="text-xs" size={20}>
                    An error occured, refresh your page or reach out to the support.
                </Info>
            </DashboardLayout>
        );
    }

    if (loading || !data) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Logs} marginBottom={60}>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    if (data.pagination.total <= 0) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Logs} marginBottom={60}>
                <h2 className="text-3xl font-semibold text-white mb-4">Logs</h2>

                <div className="flex flex-col border border-zinc-500 rounded items-center text-white text-center py-24 gap-2">
                    <h2 className="text-xl">You don&apos;t have logs yet.</h2>
                    <div className="text-sm text-zinc-400">Note that logs older than 15days are automatically cleared.</div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Logs} marginBottom={60}>
            <h2 className="text-3xl font-semibold text-white mb-4">Logs</h2>

            <div className="flex gap-2">
                <Input placeholder="Search logs..." />
                <MultiSelect label="Status" options={statusOptions} selected={states} />
            </div>

            <Table.Table className="mt-6">
                <Table.Header>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <Table.Row key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                                return (
                                    <Table.Head
                                        key={header.id}
                                        style={{
                                            width: header.getSize()
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
                    {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => (
                            <Table.Row key={row.id} data-state={row.getIsSelected() && 'selected'}>
                                {row.getVisibleCells().map((cell) => (
                                    <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
                                ))}
                            </Table.Row>
                        ))
                    ) : (
                        <Table.Row>
                            <Table.Cell colSpan={columns.length} className="h-24 text-center">
                                No results.
                            </Table.Cell>
                        </Table.Row>
                    )}
                </Table.Body>
            </Table.Table>
        </DashboardLayout>
    );
};
