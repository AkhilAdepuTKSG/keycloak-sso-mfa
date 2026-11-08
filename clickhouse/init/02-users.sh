#!/bin/bash
# Creates the Resolver's own ClickHouse user. Only this user (and the admin) can
# write to citizen360. It gets its own settings profile so a heavy query can't
# starve login lookups (design doc, failure F15).
set -e

clickhouse client --multiquery --user "${CLICKHOUSE_USER}" --password "${CLICKHOUSE_PASSWORD}" <<EOSQL
CREATE SETTINGS PROFILE IF NOT EXISTS resolver_profile
    SETTINGS max_threads = 2, max_memory_usage = 2000000000, max_execution_time = 5;
CREATE USER IF NOT EXISTS resolver
    IDENTIFIED WITH sha256_password BY '${RESOLVER_CH_PASSWORD}'
    SETTINGS PROFILE 'resolver_profile';
GRANT SELECT, INSERT ON citizen360.* TO resolver;
EOSQL

echo "[citizen360] created ClickHouse user 'resolver'"
