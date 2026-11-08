-- Citizen 360 on a single ClickHouse node (POC).
--
-- Same columns, engines (minus "Replicated") and sort keys as the production
-- design. clickhouse/cluster/citizen360-cluster.sql shows the 2 shards x 2
-- replicas layout with _local + Distributed tables; docs/clickhouse-layout.md maps
-- each table below to it.
--
-- Rules carried over from the design doc (section 6):
--   * insert only, with a version column; never ALTER UPDATE on the login path
--   * no PARTITION BY on lookup tables
--   * only the Resolver's user writes; it locks the ID, checks, then inserts
--   * reads use FINAL and check status in code

CREATE DATABASE IF NOT EXISTS citizen360;

-- Login lookup: "who owns this ID?". One row per (ID, owner) after FINAL.
-- The sort key includes cid so two owners of one ID never collapse into one row:
-- the Resolver sees both and refuses the login (failure F1).
CREATE TABLE IF NOT EXISTS citizen360.identifier_lookup
(
    id_type     LowCardinality(String),  -- NATIONAL_ID, GRO_BIRTH, PASSPORT, NIS, DL, EID, EMAIL, PHONE
    id_value    String,                  -- normalised: upper case, no spaces or dashes (emails lower case)
    cid         UUID,
    status      LowCardinality(String),  -- active, superseded, revoked
    verified    LowCardinality(String),  -- none, registry, in_person
    source      LowCardinality(String),  -- registry the ID came from
    version     UInt64,                  -- change time in ms; higher wins
    updated_at  DateTime64(3)
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (id_type, id_value, cid)
SETTINGS index_granularity = 256;

-- The same IDs sorted by person, for the profile API and merges.
CREATE TABLE IF NOT EXISTS citizen360.person_identifier
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
ENGINE = ReplacingMergeTree(version)
ORDER BY (cid, id_type, id_value);

-- Both copies come from one write: every insert into identifier_lookup lands here too.
CREATE MATERIALIZED VIEW IF NOT EXISTS citizen360.identifier_to_person_mv
TO citizen360.person_identifier
AS SELECT * FROM citizen360.identifier_lookup;

CREATE TABLE IF NOT EXISTS citizen360.person
(
    cid              UUID,                    -- = Keycloak username
    status           LowCardinality(String),  -- provisional, active, deceased, merged
    merged_into_cid  Nullable(UUID),
    loa              LowCardinality(String),  -- basic, verified, high
    version          UInt64,
    updated_at       DateTime64(3)
)
ENGINE = ReplacingMergeTree(version)
ORDER BY cid;

-- Which source record belongs to which person, and how that was decided.
CREATE TABLE IF NOT EXISTS citizen360.person_link
(
    cid               UUID,
    source_system     LowCardinality(String),  -- NIS, MPS, GRO, PASSPORT, GRA
    source_record_id  String,
    method            LowCardinality(String),  -- cross_key, probabilistic, steward, citizen_claim
    decided_by        String,
    version           UInt64,
    updated_at        DateTime64(3)
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (cid, source_system, source_record_id);

-- Steward queue: claims the write path refused, and conflicts seen at login.
CREATE TABLE IF NOT EXISTS citizen360.match_review
(
    review_id   UUID,
    kind        LowCardinality(String),  -- claim_conflict, login_conflict
    id_type     LowCardinality(String),
    id_value    String,
    cids        Array(UUID),
    detail      String,
    status      LowCardinality(String),  -- open, resolved
    created_at  DateTime64(3)
)
ENGINE = MergeTree
ORDER BY (created_at, review_id);
