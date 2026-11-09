import { createClient } from "@clickhouse/client";
import { randomUUID } from "crypto";
import { config } from "./config";
import { IdType } from "./ids";
import { nextVersion } from "./lock";

// All Citizen 360 reads and writes. Reads use FINAL and check status in code.
// Any ClickHouse error propagates as an exception; the HTTP layer turns it into
// 503 "try again" — never "not found" (design doc, F5).

export const ch = createClient({
  url: config.clickhouseUrl,
  username: config.clickhouseUser,
  password: config.clickhousePassword,
  database: config.clickhouseDb,
  request_timeout: config.clickhouseTimeoutMs,
  max_open_connections: 10,
  clickhouse_settings: {
    date_time_input_format: "best_effort",
    // "toString(cid) AS cid" must not shadow the UUID column in WHERE/IN clauses.
    prefer_column_name_to_alias: 1,
    // Single node in the POC. On the cluster the login read adds
    // optimize_skip_unused_shards = 1, skip_unavailable_shards = 0 and
    // select_sequential_consistency = 1 (see docs/clickhouse-layout.md).
  },
});

export class StoreUnavailable extends Error {}

async function rows<T>(query: string, params: Record<string, unknown>): Promise<T[]> {
  try {
    const rs = await ch.query({ query, query_params: params, format: "JSONEachRow" });
    return await rs.json<T>();
  } catch (err) {
    throw new StoreUnavailable(String(err));
  }
}

async function insert(table: string, values: Record<string, unknown>[]): Promise<void> {
  try {
    // Synchronous insert: the row is readable as soon as this returns (F10).
    await ch.insert({ table, values, format: "JSONEachRow", clickhouse_settings: { async_insert: 0 } });
  } catch (err) {
    throw new StoreUnavailable(String(err));
  }
}

export async function ping(): Promise<boolean> {
  try {
    const r = await ch.ping();
    return r.success;
  } catch {
    return false;
  }
}

const now = () => new Date().toISOString();

export interface Owner {
  cid: string;
  status: string;
}

export async function ownersOf(type: IdType, value: string): Promise<Owner[]> {
  return rows<Owner>(
    `SELECT toString(cid) AS cid, status
       FROM identifier_lookup FINAL
      WHERE id_type = {t:String} AND id_value = {v:String}`,
    { t: type, v: value },
  );
}

export interface Person {
  cid: string;
  status: string;
  merged_into_cid: string | null;
  loa: string;
}

export async function getPerson(cid: string): Promise<Person | null> {
  const r = await rows<Person>(
    `SELECT toString(cid) AS cid, status, toString(merged_into_cid) AS merged_into_cid, loa
       FROM person FINAL
      WHERE cid = {c:UUID}`,
    { c: cid },
  );
  return r[0] ?? null;
}

export interface WideIds {
  cid: string;
  national_id: string;
  nis: string;
  passport: string;
  dl: string;
  eid: string;
  gro_birth: string;
  email: string;
}

/** The argMaxIf pivot from the design doc: one wide row of a person's active IDs. */
export async function wideIds(cid: string): Promise<WideIds | null> {
  const r = await rows<WideIds>(
    `SELECT
        toString(cid) AS cid,
        argMaxIf(id_value, version, id_type = 'NATIONAL_ID') AS national_id,
        argMaxIf(id_value, version, id_type = 'NIS')         AS nis,
        argMaxIf(id_value, version, id_type = 'PASSPORT')    AS passport,
        argMaxIf(id_value, version, id_type = 'DL')          AS dl,
        argMaxIf(id_value, version, id_type = 'EID')         AS eid,
        argMaxIf(id_value, version, id_type = 'GRO_BIRTH')   AS gro_birth,
        argMaxIf(id_value, version, id_type = 'EMAIL')       AS email
      FROM (SELECT * FROM person_identifier FINAL WHERE cid = {cid:UUID})
      WHERE status = 'active'
      GROUP BY cid`,
    { cid },
  );
  return r[0] ?? null;
}

export interface IdentifierRow {
  id_type: string;
  id_value: string;
  status: string;
  verified: string;
  source: string;
  updated_at: string;
}

export async function identifiersOf(cid: string): Promise<IdentifierRow[]> {
  return rows<IdentifierRow>(
    `SELECT id_type, id_value, status, verified, source, toString(updated_at) AS updated_at
       FROM person_identifier FINAL
      WHERE cid = {cid:UUID}
      ORDER BY id_type, status, id_value`,
    { cid },
  );
}

export interface LinkRow {
  source_system: string;
  source_record_id: string;
  method: string;
  decided_by: string;
}

export async function linksOf(cid: string): Promise<LinkRow[]> {
  return rows<LinkRow>(
    `SELECT source_system, source_record_id, method, decided_by
       FROM person_link FINAL
      WHERE cid = {cid:UUID}
      ORDER BY source_system, source_record_id`,
    { cid },
  );
}

export async function insertIdentifier(r: {
  type: IdType;
  value: string;
  cid: string;
  status: string;
  verified: string;
  source: string;
}): Promise<number> {
  const version = nextVersion();
  await insert("identifier_lookup", [
    {
      id_type: r.type,
      id_value: r.value,
      cid: r.cid,
      status: r.status,
      verified: r.verified,
      source: r.source,
      version,
      updated_at: now(),
    },
  ]);
  return version;
}

export async function insertPerson(p: { cid: string; status: string; loa: string; merged_into_cid?: string | null }) {
  const version = nextVersion();
  await insert("person", [
    { cid: p.cid, status: p.status, loa: p.loa, merged_into_cid: p.merged_into_cid ?? null, version, updated_at: now() },
  ]);
  return version;
}

export async function insertLinks(cid: string, links: { source_system: string; source_record_id: string; method: string; decided_by: string }[]) {
  if (!links.length) return;
  const version = nextVersion();
  await insert(
    "person_link",
    links.map((l) => ({ ...l, cid, version, updated_at: now() })),
  );
}

export async function addReview(kind: string, type: string, value: string, cids: string[], detail: string) {
  await insert("match_review", [
    { review_id: randomUUID(), kind, id_type: type, id_value: value, cids, detail, status: "open", created_at: now() },
  ]);
}

export async function openReviews() {
  return rows<Record<string, unknown>>(
    `SELECT toString(review_id) AS review_id, kind, id_type, id_value, arrayMap(c -> toString(c), cids) AS cids,
            detail, status, toString(created_at) AS created_at
       FROM match_review
      ORDER BY created_at DESC
      LIMIT 100`,
    {},
  );
}

/** Layer 3 of "keeping each ID unique": government IDs with more than one active owner. */
export async function duplicateActiveIds() {
  return rows<Record<string, unknown>>(
    `SELECT id_type, id_value, arraySort(groupArray(toString(cid))) AS cids, count() AS owners
       FROM (SELECT * FROM identifier_lookup FINAL)
      WHERE status = 'active' AND id_type NOT IN ('EMAIL', 'PHONE')
      GROUP BY id_type, id_value
     HAVING owners > 1
      ORDER BY id_type, id_value`,
    {},
  );
}

/** The two identifier copies should hold the same rows (F8). */
export async function copiesInStep() {
  const r = await rows<{ by_id: string; by_person: string }>(
    `SELECT (SELECT count() FROM identifier_lookup FINAL) AS by_id,
            (SELECT count() FROM person_identifier FINAL) AS by_person`,
    {},
  );
  return { byId: Number(r[0]?.by_id ?? 0), byPerson: Number(r[0]?.by_person ?? 0) };
}

/** IDs that point at a person row that doesn't exist. */
export async function orphanIds() {
  return rows<Record<string, unknown>>(
    `SELECT id_type, id_value, toString(cid) AS cid
       FROM (SELECT * FROM identifier_lookup FINAL) AS i
      WHERE status = 'active' AND cid NOT IN (SELECT cid FROM person FINAL)
      LIMIT 100`,
    {},
  );
}
