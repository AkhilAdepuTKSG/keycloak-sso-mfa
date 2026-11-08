# Citizen 360 on ClickHouse: POC vs production layout

The POC runs one ClickHouse node ([clickhouse/init/01-schema.sql](../clickhouse/init/01-schema.sql)).
Production runs **2 shards × 2 replicas + a 3-node ClickHouse Keeper**
([clickhouse/cluster/citizen360-cluster.sql](../clickhouse/cluster/citizen360-cluster.sql), reference only).
Columns and sort keys are the same in both. What changes is the engine, and every table name
becomes a pair: `<name>_local` holds the data, `<name>` is a Distributed table that routes.

The Resolver uses the plain names (`identifier_lookup`, `person`, …) in both setups, so its SQL doesn't change.

| POC table (single node) | Engine in POC | Sort key | Production `_local` table | Production Distributed table | Sharding key |
|---|---|---|---|---|---|
| `identifier_lookup` | `ReplacingMergeTree(version)` | `(id_type, id_value, cid)` | `identifier_lookup_local`, `ReplicatedReplacingMergeTree(…, version)` | `identifier_lookup` | `cityHash64(id_type, id_value)` |
| `person_identifier` | `ReplacingMergeTree(version)` | `(cid, id_type, id_value)` | `person_identifier_local`, `ReplicatedReplacingMergeTree(…, version)` | `person_identifier` | `cityHash64(cid)` |
| `identifier_to_person_mv` | MV `identifier_lookup` → `person_identifier` | — | MV on `identifier_lookup_local` → Distributed `person_identifier` | — | re-routes by `cid` |
| `person` | `ReplacingMergeTree(version)` | `cid` | `person_local`, `ReplicatedReplacingMergeTree(…, version)` | `person` | `cityHash64(cid)` |
| `person_link` | `ReplacingMergeTree(version)` | `(cid, source_system, source_record_id)` | `person_link_local` | `person_link` | `cityHash64(cid)` |
| `match_review` | `MergeTree` | `(created_at, review_id)` | `match_review_local`, `ReplicatedMergeTree` | `match_review` | `cityHash64(review_id)` |

## Rules the POC already follows

- **Insert only, with versions.** No `ALTER UPDATE`. A superseded passport is a new row with
  `status = 'superseded'`; nothing is edited in place.
- **Conflicts stay visible.** `cid` is in the `identifier_lookup` sort key, so two owners of one
  ID are two rows after `FINAL`. The Resolver counts active owners: 0 = not found, 1 = log in,
  2+ = refuse. The seed creates exactly this case (NIS `4000099`).
- **One write path.** Only the `resolver` ClickHouse user (and the admin) can insert. The
  Resolver locks the ID (in-process lock), reads current owners, and inserts only if no one
  else owns it. A refused claim goes to `match_review`.
- **Reads use `FINAL`, status checked in code.**
- **No per-login writes** in ClickHouse. A login conflict is logged as an alert; it's not
  written to a table.
- **Store errors mean "try again".** Any ClickHouse error becomes HTTP 503 from the Resolver and
  "try again" on the login form, never "not found".
- **Daily integrity checks.** `GET /v1/integrity` on the Resolver runs: duplicate active IDs,
  the two identifier copies in step, and IDs that point at a missing person.

## What changes on the cluster

- Login reads add `optimize_skip_unused_shards = 1`, `skip_unavailable_shards = 0` and
  `select_sequential_consistency = 1`, so each lookup goes to one shard and a down shard is
  an error, not an empty answer (F5).
- Claims and merges insert with `insert_quorum = 2` and `distributed_foreground_insert = 1`,
  so a claim is readable as soon as it returns (F10, F12).
- Only the Distributed tables get `INSERT` grants. A row written straight into a `_local`
  table could land on the wrong shard, where `FINAL` can't collapse it (F6).
- The per-ID lock moves from in-process to Redis or a Keeper ephemeral node, because there
  will be more than one Resolver pod.
- Adding a third shard changes `cityHash64(...) % shards` routing. It is a rebuild: new
  tables, backfill, verify counts, switch the Resolver (F7).
