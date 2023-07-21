const tableName = '_nango_connections';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.index('provider_config_key');
        table.index('connection_id');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropIndex('provider_config_key');
        table.dropIndex('connection_id');
    });
};


