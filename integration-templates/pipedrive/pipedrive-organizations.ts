import type { PipeDriveOrganization, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/organizations/collection';
        const config = {
            ...(nango.lastSyncDate ? { params: { since: nango.lastSyncDate?.toISOString() } } : {}),
            paginate: {
                limit: 100
            }
        };

        for await (const organization of paginate(nango, endpoint, config)) {
            const mappedOrganization: PipeDriveOrganization[] = organization.map(mapOrganization) || [];
            const batchSize: number = mappedOrganization.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} organizations (total organizations: ${totalRecords})`);
            await nango.batchSave(mappedOrganization, 'PipeDriveOrganization');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

async function* paginate(nango: NangoSync, endpoint: string, config?: any, queryParams?: Record<string, string | string[]>) {
    let cursor: string | undefined;
    let callParams = queryParams || {};

    while (true) {
        if (cursor) {
            callParams['cursor'] = `${cursor}`;
        }

        const resp = await nango.proxy({
            method: 'GET',
            endpoint: endpoint,
            params: {
                ...(config?.paginate?.limit && { limit: config.paginate.limit }),
                ...(config?.params?.since && { since: config.params.since }),
                ...callParams
            }
        });

        const organizations = resp.data.data;

        if (!organizations || organizations.length === 0) {
            break;
        }

        yield organizations;

        if (!resp.data.additional_data || !resp.data.additional_data.next_cursor) {
            break;
        } else {
            cursor = resp.data.additional_data.next_cursor;
        }
    }
}

function mapOrganization(organization: any): PipeDriveOrganization {
    return {
        id: organization.id,
        owner_id: organization.owner_id,
        name: organization.name,
        active_flag: organization.active_flag,
        update_time: organization.update_time,
        delete_time: organization.delete_time,
        add_time: organization.add_time,
        visible_to: organization.visible_to,
        label: organization.label,
        address: organization.address,
        address_subpremise: organization.address_subpremise,
        address_street_number: organization.address_street_number,
        address_route: organization.address_route,
        address_sublocality: organization.address_sublocality,
        address_locality: organization.address_locality,
        address_admin_area_level_1: organization.address_admin_area_level_1,
        address_admin_area_level_2: organization.address_admin_area_level_2,
        address_country: organization.address_country,
        address_postal_code: organization.address_postal_code,
        address_formatted_address: organization.address_formatted_address,
        cc_email: organization.cc_email
    };
}
