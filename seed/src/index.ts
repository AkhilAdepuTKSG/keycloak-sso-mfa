// Citizen 360 seed loader.
//
//  1. Extract every record from the five registry APIs (+ a small GRA driver's-licence CSV).
//  2. Link records into people by cross-reference keys: national ID and GRO birth number.
//     Simple deterministic matching (union-find); no probabilistic matching. A scholarship
//     applicant with no government ID becomes a provisional person at Basic assurance.
//  3. Write each person and each ID through the Resolver's write path (lock, check, insert).
//  4. Simulate the F1 failure: one NIS number with two active owners.
//  5. Create Keycloak users with username = CID and the test passwords from people.ts.
//
// Idempotent: CIDs are UUIDv5 of the anchor key, so re-running writes new versions of the
// same rows and resets the same Keycloak users.

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { ACCOUNTS, F1_CONFLICT } from "./people";

const env = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${name}`);
  return v;
};

const RESOLVER = env("RESOLVER_URL", "http://resolver:8090");
const RESOLVER_KEY = env("RESOLVER_SERVICE_KEY");
const REGISTRY_KEY = env("REGISTRY_API_KEY");
const REGISTRY_URLS = {
  NIS: env("NIS_API_URL", "http://nis-api:8080"),
  MPS: env("MPS_API_URL", "http://mps-api:8080"),
  GRO: env("GRO_API_URL", "http://gro-api:8080"),
  PASSPORT: env("PASSPORT_API_URL", "http://passport-api:8080"),
  SCHOLARSHIPS: env("SCHOLARSHIPS_API_URL", "http://scholarships-api:8080"),
};
const CLICKHOUSE = env("CLICKHOUSE_URL", "http://clickhouse:8123");
const CH_ADMIN = env("CLICKHOUSE_ADMIN_USER");
const CH_ADMIN_PASSWORD = env("CLICKHOUSE_ADMIN_PASSWORD");
const KEYCLOAK = env("KEYCLOAK_URL", "http://keycloak:8080");
const KC_ADMIN = env("KC_ADMIN_USERNAME");
const KC_ADMIN_PASSWORD = env("KC_ADMIN_PASSWORD");
const REALM = env("KEYCLOAK_REALM", "citizen");

// Fixed namespace so the same anchor always yields the same CID.
const CID_NAMESPACE = "3b7c1f0e-2d4a-4c8e-9f61-5a2b8c9d0e17";

function uuidv5(name: string, namespace = CID_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(name: string, url: string, ok: (r: Response) => boolean = (r) => r.ok) {
  for (let i = 1; i <= 90; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (ok(r)) {
        console.log(`  ✓ ${name} is up`);
        return;
      }
    } catch {
      /* not yet */
    }
    await sleep(2000);
  }
  throw new Error(`${name} did not come up at ${url}`);
}

// ---------------------------------------------------------------------------
// 1. Extract
// ---------------------------------------------------------------------------

type System = "NIS" | "MPS" | "GRO" | "PASSPORT" | "SCHOLARSHIPS" | "GRA";

interface Claim {
  type: string;
  value: string;
  status: "active" | "superseded";
  verified: "none" | "registry" | "in_person";
  source: string;
}

interface SourceRecord {
  system: System;
  recordId: string;
  anchors: string[]; // "NID:..." and "GRO:..." cross-reference keys
  claims: Claim[];
  displayName: string;
}

async function extract(system: keyof typeof REGISTRY_URLS, resource: string): Promise<Record<string, any>[]> {
  const url = `${REGISTRY_URLS[system]}/api/${system.toLowerCase()}/${resource}`;
  const r = await fetch(url, { headers: { "X-Api-Key": REGISTRY_KEY } });
  if (!r.ok) throw new Error(`extract ${system} failed: ${r.status} ${await r.text()}`);
  const body = (await r.json()) as { records: Record<string, any>[] };
  console.log(`  ${system}: ${body.records.length} records`);
  return body.records;
}

function anchors(nid?: string | null, gro?: string | null) {
  return [nid ? `NID:${nid}` : null, gro ? `GRO:${gro}` : null].filter(Boolean) as string[];
}

async function extractAll(): Promise<SourceRecord[]> {
  const out: SourceRecord[] = [];

  for (const r of await extract("NIS", "members")) {
    const claims: Claim[] = [{ type: "NIS", value: r.nis_number, status: "active", verified: "registry", source: "NIS" }];
    if (r.email) claims.push({ type: "EMAIL", value: r.email, status: "active", verified: "none", source: "NIS" });
    out.push({ system: "NIS", recordId: `nis_member:${r.id}`, anchors: anchors(r.national_id, r.gro_birth_no), claims, displayName: `${r.first_name} ${r.last_name}` });
  }
  for (const r of await extract("MPS", "employees")) {
    out.push({
      system: "MPS",
      recordId: `mps_employee:${r.id}`,
      anchors: anchors(r.national_id, null),
      claims: [{ type: "EID", value: r.eid, status: "active", verified: "in_person", source: "MPS" }],
      displayName: `${r.first_name} ${r.last_name}`,
    });
  }
  for (const r of await extract("GRO", "births")) {
    out.push({
      system: "GRO",
      recordId: `gro_birth:${r.id}`,
      anchors: anchors(null, r.registration_no),
      claims: [{ type: "GRO_BIRTH", value: r.registration_no, status: "active", verified: "registry", source: "GRO" }],
      displayName: `${r.first_name} ${r.last_name}`,
    });
  }
  for (const r of await extract("PASSPORT", "passports")) {
    out.push({
      system: "PASSPORT",
      recordId: `passport_record:${r.id}`,
      anchors: anchors(r.national_id, r.gro_birth_no),
      claims: [{
        type: "PASSPORT",
        value: r.passport_number,
        status: r.status === "VALID" ? "active" : "superseded",
        verified: "registry",
        source: "PASSPORT",
      }],
      displayName: `${r.given_names} ${r.surname}`,
    });
  }

  for (const r of await extract("SCHOLARSHIPS", "applications")) {
    // Email is a contact, never a linking key: a family can share one.
    out.push({
      system: "SCHOLARSHIPS",
      recordId: `scholarship_application:${r.id}`,
      anchors: anchors(r.national_id, null),
      claims: [{ type: "EMAIL", value: r.applicant_email, status: "active", verified: "none", source: "SCHOLARSHIPS" }],
      displayName: `${r.first_name} ${r.last_name}`,
    });
  }

  const csv = readFileSync(join(__dirname, "..", "extracts", "gra-driver-licences.csv"), "utf8").trim().split(/\r?\n/);
  for (const line of csv.slice(1)) {
    const [nid, dl] = line.split(",");
    out.push({
      system: "GRA",
      recordId: `gra_licence:${dl}`,
      anchors: anchors(nid, null),
      claims: [{ type: "DL", value: dl, status: "active", verified: "registry", source: "GRA" }],
      displayName: "",
    });
  }
  console.log(`  GRA (CSV extract): ${csv.length - 1} records`);
  return out;
}

// ---------------------------------------------------------------------------
// 2. Link (union-find over cross-reference keys)
// ---------------------------------------------------------------------------

interface LinkedPerson {
  cid: string;
  /** What the CID is derived from: NATIONAL_ID:..., GRO_BIRTH:... or, for a self-registered applicant, EMAIL:... */
  anchor: string;
  nationalId: string | null;
  name: string;
  status: "active" | "provisional";
  loa: "basic" | "verified" | "high";
  records: SourceRecord[];
  claims: Claim[];
}

function link(records: SourceRecord[]): LinkedPerson[] {
  const parent = records.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byAnchor = new Map<string, number>();
  records.forEach((rec, i) => {
    for (const a of rec.anchors) {
      const j = byAnchor.get(a);
      if (j === undefined) byAnchor.set(a, i);
      else parent[find(i)] = find(j);
    }
  });

  const groups = new Map<number, SourceRecord[]>();
  records.forEach((rec, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), rec]);
  });

  const people: LinkedPerson[] = [];
  for (const recs of groups.values()) {
    const nids = [...new Set(recs.flatMap((r) => r.anchors.filter((a) => a.startsWith("NID:")).map((a) => a.slice(4))))];
    if (nids.length > 1) {
      // Two national IDs in one cluster: never auto-merge; a steward decides.
      console.warn(`  ! records link two national IDs (${nids.join(", ")}); left for steward review`);
      continue;
    }
    const gro = recs.flatMap((r) => r.anchors.filter((a) => a.startsWith("GRO:")).map((a) => a.slice(4)))[0];
    const nid = nids[0] ?? null;
    const claims: Claim[] = [];
    if (nid) claims.push({ type: "NATIONAL_ID", value: nid, status: "active", verified: "registry", source: "GECOM" });
    for (const r of recs) claims.push(...r.claims);
    const email = claims.find((c) => c.type === "EMAIL")?.value;
    const anchor = nid ? `NATIONAL_ID:${nid}` : gro ? `GRO_BIRTH:${gro}` : `EMAIL:${email}`;
    const matched = Boolean(nid || gro); // matched to a registry by a government key
    const name = recs.find((r) => r.system === "NIS")?.displayName ?? recs.find((r) => r.displayName)?.displayName ?? "?";
    people.push({
      cid: uuidv5(anchor),
      anchor,
      nationalId: nid,
      name,
      status: matched ? "active" : "provisional",
      loa: claims.some((c) => c.type === "EID") ? "high" : matched ? "verified" : "basic",
      records: recs,
      claims,
    });
  }
  return people.sort((a, b) => (a.nationalId ?? "~").localeCompare(b.nationalId ?? "~"));
}

// ---------------------------------------------------------------------------
// 3. Write through the Resolver
// ---------------------------------------------------------------------------

async function resolverPost(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const r = await fetch(`${RESOLVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Service-Key": RESOLVER_KEY },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

async function load(people: LinkedPerson[]) {
  for (const p of people) {
    const created = await resolverPost("/v1/persons", {
      cid: p.cid,
      status: p.status,
      loa: p.loa,
      links: p.records.map((r) => ({
        source_system: r.system,
        source_record_id: r.recordId,
        method: "cross_key",
        decided_by: "seed-loader",
      })),
    });
    if (created.status !== 201) throw new Error(`person ${p.cid}: ${created.status} ${JSON.stringify(created.json)}`);

    const results: string[] = [];
    for (const c of p.claims) {
      const w = await resolverPost("/v1/identifiers", { cid: p.cid, ...c });
      if (w.status === 201) results.push(`${c.type}${c.status === "active" ? "" : "(" + c.status + ")"}`);
      else if (w.status === 409) results.push(`${c.type}:REFUSED(conflict→steward queue)`);
      else throw new Error(`identifier ${c.type} for ${p.cid}: ${w.status} ${JSON.stringify(w.json)}`);
    }
    console.log(`  ${p.cid}  ${p.name.padEnd(20)} loa=${p.loa.padEnd(8)} ${results.join(" ")}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Simulate failure F1 (bypasses the Resolver on purpose)
// ---------------------------------------------------------------------------

async function simulateF1(people: LinkedPerson[]) {
  const owner = people.find((p) => p.anchor === F1_CONFLICT.secondOwnerAnchor);
  if (!owner) throw new Error("F1 owner not found");
  const row = {
    id_type: F1_CONFLICT.idType,
    id_value: F1_CONFLICT.idValue,
    cid: owner.cid,
    status: "active",
    verified: "registry",
    source: "NIS-LEGACY-BULK",
    version: Date.now(),
    updated_at: new Date().toISOString(),
  };
  const query = "INSERT INTO citizen360.identifier_lookup FORMAT JSONEachRow";
  const r = await fetch(`${CLICKHOUSE}/?date_time_input_format=best_effort&query=${encodeURIComponent(query)}`, {
    method: "POST",
    headers: { "X-ClickHouse-User": CH_ADMIN, "X-ClickHouse-Key": CH_ADMIN_PASSWORD },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`F1 insert failed: ${r.status} ${await r.text()}`);
  console.log(`  ! inserted ${F1_CONFLICT.idType} ${F1_CONFLICT.idValue} → ${owner.cid} directly (second active owner)`);
}

// ---------------------------------------------------------------------------
// 5. Keycloak accounts: username = CID, password only
// ---------------------------------------------------------------------------

async function kcToken(): Promise<string> {
  const r = await fetch(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: KC_ADMIN, password: KC_ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`keycloak admin login failed: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { access_token: string }).access_token;
}

async function upsertUser(token: string, cid: string, password: string): Promise<"created" | "updated"> {
  const base = `${KEYCLOAK}/admin/realms/${REALM}/users`;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const create = await fetch(base, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      username: cid,
      enabled: true,
      requiredActions: [],
      credentials: [{ type: "password", value: password, temporary: false }],
    }),
  });
  if (create.status === 201) return "created";
  if (create.status !== 409) throw new Error(`create user ${cid}: ${create.status} ${await create.text()}`);

  const found = await fetch(`${base}?username=${encodeURIComponent(cid)}&exact=true`, { headers: auth });
  const [user] = (await found.json()) as { id: string }[];
  if (!user) throw new Error(`user ${cid} exists but was not found`);
  const reset = await fetch(`${base}/${user.id}/reset-password`, {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ type: "password", value: password, temporary: false }),
  });
  if (!reset.ok) throw new Error(`reset password ${cid}: ${reset.status} ${await reset.text()}`);
  await fetch(`${base}/${user.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ enabled: true, requiredActions: [] }) });
  return "updated";
}

async function accounts(people: LinkedPerson[]) {
  const token = await kcToken();
  for (const a of ACCOUNTS) {
    const p = people.find((x) => x.anchor === a.anchor);
    if (!p) throw new Error(`no linked person for ${a.anchor}`);
    const what = await upsertUser(token, p.cid, a.password);
    console.log(`  ${what.padEnd(7)} ${p.cid}  ${p.name}  (${a.scenario})`);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("Waiting for services…");
  await waitFor("resolver + ClickHouse", `${RESOLVER}/ready`);
  for (const [name, url] of Object.entries(REGISTRY_URLS)) await waitFor(`${name} registry`, `${url}/health`);
  await waitFor("Keycloak realm", `${KEYCLOAK}/realms/${REALM}/.well-known/openid-configuration`);

  console.log("\n1. Extracting registries…");
  const records = await extractAll();

  console.log("\n2. Linking by cross-reference keys (national ID, GRO birth number)…");
  const people = link(records);
  console.log(`  ${records.length} source records → ${people.length} people`);

  console.log("\n3. Writing to Citizen 360 through the Resolver write path…");
  await load(people);

  console.log("\n4. Simulating failure F1 (bypassing the Resolver)…");
  await simulateF1(people);

  console.log("\n5. Keycloak accounts (username = CID)…");
  await accounts(people);

  const integrity = await fetch(`${RESOLVER}/v1/integrity`, { headers: { "X-Service-Key": RESOLVER_KEY } });
  console.log("\nIntegrity check:", JSON.stringify(await integrity.json()));

  console.log("\nPeople:");
  for (const p of people) {
    const ids = p.claims.map((c) => `${c.type}=${c.value}${c.status === "active" ? "" : "(" + c.status + ")"}`).join(" ");
    const account = ACCOUNTS.some((a) => a.anchor === p.anchor) ? "account" : "no account";
    console.log(`  ${p.cid}  ${p.name} [${account}, ${p.loa}]  ${ids}`);
  }
  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error("SEED FAILED:", err);
  process.exit(1);
});
