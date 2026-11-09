-- Citizen 360 on the production layout: cluster `citizen360`, 2 shards x 2 replicas,
-- coordinated by a 3-node ClickHouse Keeper. REFERENCE ONLY: the POC runs
-- clickhouse/init/01-schema.sql on a single node. Columns and sort keys are identical;
-- only the engines change (Replicated*, plus a Distributed table per name).
--
-- Each table is two objects:
--   <name>_local  holds the data on every shard (replicated inside the shard)
--   <name>        Distributed: holds nothing, routes reads and writes to the right shard
-- The application (the Resolver) only ever reads and writes the Distributed names.
-- Local-table INSERT is denied by grants, so every version of an ID lands on one shard (F6).

CREATE DATABASE IF NOT EXISTS citizen360 ON CLUSTER citizen360;

-- Login lookup: sharded by the ID, sorted by ID then owner.
CREATE TABLE citizen360.identifier_lookup_local ON CLUSTER citizen360
(
    id_type     LowCardinality(String),
    id_value    String,
    cid         UUID,
    status      LowCardinality(String),
    verified    LowCardinality(String),
    source      LowCardinality(String),
    version     UInt64,
    updated_at  DateTime64(3)
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/identifier_lookup', '{replica}', version)
ORDER BY (id_type, id_value, cid)
SETTINGS index_granularity = 256;

CREATE TABLE citizen360.identifier_lookup ON CLUSTER citizen360 AS citizen360.identifier_lookup_local
ENGINE = Distributed(citizen360, citizen360, identifier_lookup_local, cityHash64(id_type, id_value));

-- Same IDs, sharded by person (profile API, merges).
CREATE TABLE citizen360.person_identifier_local ON CLUSTER citizen360
(
    id_type     LowCardinality(String),
    id_value    String,
    cid         UUID,
    status      LowCardinality(String),
    verified    LowCardinality(String),
    source      LowCardinality(String),
    version     UInt64,
    updated_at  DateTime64(3)
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/person_identifier', '{replica}', version)
ORDER BY (cid, id_type, id_value);

CREATE TABLE citizen360.person_identifier ON CLUSTER citizen360 AS citizen360.person_identifier_local
ENGINE = Distributed(citizen360, citizen360, person_identifier_local, cityHash64(cid));

-- Runs on each shard as rows arrive in identifier_lookup_local and re-routes them by cid
-- through the Distributed person_identifier table, so both copies come from one write.
CREATE MATERIALIZED VIEW citizen360.identifier_to_person_mv ON CLUSTER citizen360
TO citizen360.person_identifier
AS SELECT * FROM citizen360.identifier_lookup_local;

CREATE TABLE citizen360.person_local ON CLUSTER citizen360
(
    cid              UUID,
    status           LowCardinality(String),
    merged_into_cid  Nullable(UUID),
    loa              LowCardinality(String),
    version          UInt64,
    updated_at       DateTime64(3)
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/person', '{replica}', version)
ORDER BY cid;

CREATE TABLE citizen360.person ON CLUSTER citizen360 AS citizen360.person_local
ENGINE = Distributed(citizen360, citizen360, person_local, cityHash64(cid));

CREATE TABLE citizen360.person_link_local ON CLUSTER citizen360
(
    cid               UUID,
    source_system     LowCardinality(String),
    source_record_id  String,
    method            LowCardinality(String),
    decided_by        String,
    version           UInt64,
    updated_at        DateTime64(3)
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/person_link', '{replica}', version)
ORDER BY (cid, source_system, source_record_id);

CREATE TABLE citizen360.person_link ON CLUSTER citizen360 AS citizen360.person_link_local
ENGINE = Distributed(citizen360, citizen360, person_link_local, cityHash64(cid));

CREATE TABLE citizen360.match_review_local ON CLUSTER citizen360
(
    review_id   UUID,
    kind        LowCardinality(String),
    id_type     LowCardinality(String),
    id_value    String,
    cids        Array(UUID),
    detail      String,
    status      LowCardinality(String),
    created_at  DateTime64(3)
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/match_review', '{replica}')
ORDER BY (created_at, review_id);

CREATE TABLE citizen360.match_review ON CLUSTER citizen360 AS citizen360.match_review_local
ENGINE = Distributed(citizen360, citizen360, match_review_local, cityHash64(review_id));

-- Only the Resolver writes, and only through the Distributed tables.
-- GRANT SELECT ON citizen360.* TO resolver ON CLUSTER citizen360;
-- GRANT INSERT ON citizen360.identifier_lookup, citizen360.person, citizen360.person_link,
--                 citizen360.match_review TO resolver ON CLUSTER citizen360;

-- The Resolver's login read on the cluster:
--   SELECT cid, status FROM identifier_lookup FINAL
--   WHERE id_type = {t:String} AND id_value = {v:String}
--   SETTINGS optimize_skip_unused_shards = 1, skip_unavailable_shards = 0,
--            select_sequential_consistency = 1;
-- Claims and merges insert with:
--   SETTINGS insert_quorum = 2, distributed_foreground_insert = 1;
