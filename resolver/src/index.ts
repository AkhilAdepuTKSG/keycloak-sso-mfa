import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "crypto";
import { z } from "zod";
import { config } from "./config";
import { accessLog, ah, logger, requestId } from "./http";
import { isService, requireService, tokenCid } from "./auth";
import { isIdType, matchesFormat, normalise, SHARED_TYPES, IdType, ID_TYPES } from "./ids";
import { withLock } from "./lock";
import * as store from "./store";
import { StoreUnavailable } from "./store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Any storage error answers 503 "try again" — never 404 (design doc, F5). */
function unavailable(res: Response, err: unknown) {
  logger.warn("citizen360 store unavailable", { err: String(err) });
  return res.status(503).json({ result: "unavailable", retry: true, message: "Citizen 360 is unavailable; try again" });
}

type ResolveResult =
  | { result: "found"; cid: string; loa: string; personStatus: string }
  | { result: "not_found" }
  | { result: "conflict"; owners: number }
  | { result: "inactive"; reason: string };

async function resolve(type: IdType, rawValue: string): Promise<ResolveResult> {
  const value = normalise(type, rawValue);
  const owners = await store.ownersOf(type, value);
  const active = [...new Set(owners.filter((o) => o.status === "active").map((o) => o.cid))];

  if (active.length === 0) return { result: "not_found" };
  if (active.length > 1) {
    // 2+ active owners: refuse and alert a steward. Logged, not written: no per-login writes in ClickHouse (F9).
    logger.error("ALERT identifier has more than one active owner; login refused", {
      id_type: type,
      owners: active.length,
    });
    return { result: "conflict", owners: active.length };
  }

  // Follow merges to the surviving person.
  let cid = active[0];
  for (let hop = 0; hop < 5; hop++) {
    const person = await store.getPerson(cid);
    if (!person) {
      logger.error("integrity: identifier points to a missing person", { id_type: type, cid });
      return { result: "not_found" };
    }
    if (person.status === "merged" && person.merged_into_cid) {
      cid = person.merged_into_cid;
      continue;
    }
    if (person.status === "deceased") return { result: "inactive", reason: "deceased" };
    return { result: "found", cid, loa: person.loa, personStatus: person.status };
  }
  logger.error("integrity: merge chain too long", { cid });
  return { result: "not_found" };
}

const STATUS_CODE: Record<ResolveResult["result"], number> = { found: 200, not_found: 404, conflict: 409, inactive: 410 };

async function handleResolve(req: Request, res: Response, type: unknown, value: unknown) {
  if (typeof type !== "string" || !isIdType(type) || typeof value !== "string" || !value.trim()) {
    return res.status(400).json({ error: "type and value are required", types: ID_TYPES });
  }
  try {
    const r = await resolve(type, value);
    res.status(STATUS_CODE[r.result]).json(r);
  } catch (err) {
    if (err instanceof StoreUnavailable) return unavailable(res, err);
    throw err;
  }
}

const personSchema = z.object({
  cid: z.string().regex(UUID_RE).optional(),
  status: z.enum(["provisional", "active", "deceased", "merged"]).default("active"),
  loa: z.enum(["basic", "verified", "high"]),
  merged_into_cid: z.string().regex(UUID_RE).nullable().optional(),
  links: z
    .array(
      z.object({
        source_system: z.string().min(1),
        source_record_id: z.string().min(1),
        method: z.enum(["cross_key", "probabilistic", "steward", "citizen_claim"]).default("cross_key"),
        decided_by: z.string().default("resolver"),
      }),
    )
    .default([]),
});

const identifierSchema = z.object({
  cid: z.string().regex(UUID_RE),
  type: z.enum(ID_TYPES),
  value: z.string().min(1),
  status: z.enum(["active", "superseded", "revoked"]).default("active"),
  verified: z.enum(["none", "registry", "in_person"]).default("registry"),
  source: z.string().min(1),
});

async function main() {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: "100kb" }));
  app.use(accessLog);

  // Liveness: the process is up. Doesn't touch ClickHouse, so a ClickHouse outage
  // never makes the orchestrator restart the Resolver (or anything else).
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  // Readiness: can we reach ClickHouse right now?
  app.get("/ready", ah(async (_req, res) => {
    const ok = await store.ping();
    res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "clickhouse unavailable" });
  }));

  // ---- resolve(type, value) -> CID (Keycloak SPI) ----
  app.post("/v1/resolve", requireService, ah(async (req, res) => handleResolve(req, res, req.body?.type, req.body?.value)));
  app.get("/v1/resolve", requireService, ah(async (req, res) => handleResolve(req, res, req.query.type, req.query.value)));

  // ---- profile: the person's IDs as one wide row (argMaxIf pivot) ----
  app.get("/v1/profile/:cid", ah(async (req, res) => {
    const cid = String(req.params.cid).toLowerCase();
    if (!UUID_RE.test(cid)) return res.status(400).json({ error: "cid must be a UUID" });
    if (!isService(req)) {
      const own = await tokenCid(req);
      if (!own) return res.status(401).json({ error: "bearer token or service key required" });
      if (own.toLowerCase() !== cid) return res.status(403).json({ error: "a portal may only read the signed-in person's profile" });
    }
    try {
      const [person, wide, identifiers, links] = await Promise.all([
        store.getPerson(cid),
        store.wideIds(cid),
        store.identifiersOf(cid),
        store.linksOf(cid),
      ]);
      if (!person) return res.status(404).json({ error: "no such person" });
      const blankToNull = (v: string | undefined) => (v ? v : null);
      res.json({
        cid,
        person: { status: person.status, loa: person.loa, merged_into_cid: person.merged_into_cid },
        ids: {
          national_id: blankToNull(wide?.national_id),
          nis: blankToNull(wide?.nis),
          passport: blankToNull(wide?.passport),
          dl: blankToNull(wide?.dl),
          eid: blankToNull(wide?.eid),
          gro_birth: blankToNull(wide?.gro_birth),
          email: blankToNull(wide?.email),
        },
        identifiers,
        links,
      });
    } catch (err) {
      if (err instanceof StoreUnavailable) return unavailable(res, err);
      throw err;
    }
  }));

  // ---- write path: persons ----
  app.post("/v1/persons", requireService, ah(async (req, res) => {
    const parsed = personSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid input", issues: parsed.error.issues });
    const p = parsed.data;
    const cid = (p.cid ?? randomUUID()).toLowerCase();
    try {
      const version = await store.insertPerson({ cid, status: p.status, loa: p.loa, merged_into_cid: p.merged_into_cid });
      await store.insertLinks(cid, p.links);
      res.status(201).json({ result: "written", cid, version });
    } catch (err) {
      if (err instanceof StoreUnavailable) return unavailable(res, err);
      throw err;
    }
  }));

  // ---- write path: claim / link one ID (lock the ID, check owners, insert) ----
  app.post("/v1/identifiers", requireService, ah(async (req, res) => {
    const parsed = identifierSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid input", issues: parsed.error.issues });
    const body = parsed.data;
    const cid = body.cid.toLowerCase();
    const value = normalise(body.type, body.value);
    if (!matchesFormat(body.type, value)) {
      return res.status(400).json({ error: `value is not a valid ${body.type}` });
    }

    try {
      const outcome = await withLock(`${body.type}:${value}`, async () => {
        const person = await store.getPerson(cid);
        if (!person) return { code: 404, body: { result: "rejected", error: "unknown person; create it first" } };

        const owners = await store.ownersOf(body.type, value);
        const others = owners.filter((o) => o.status === "active" && o.cid !== cid).map((o) => o.cid);
        if (body.status === "active" && others.length && !SHARED_TYPES.has(body.type)) {
          await store.addReview("claim_conflict", body.type, value, [...others, cid],
            `claim by ${body.source} refused: already actively owned`);
          logger.warn("claim refused: identifier already has an active owner; sent to steward review", {
            id_type: body.type,
          });
          return { code: 409, body: { result: "conflict", owners: others.length, review: "queued" } };
        }

        const version = await store.insertIdentifier({
          type: body.type, value, cid, status: body.status, verified: body.verified, source: body.source,
        });

        // Re-check after the insert (F2): with one writer per ID this never fires.
        if (body.status === "active" && !SHARED_TYPES.has(body.type)) {
          const after = await store.ownersOf(body.type, value);
          const activeNow = new Set(after.filter((o) => o.status === "active").map((o) => o.cid));
          if (activeNow.size > 1) {
            await store.addReview("claim_conflict", body.type, value, [...activeNow], "detected after insert");
            logger.error("ALERT identifier gained a second active owner after insert", { id_type: body.type });
          }
        }
        return { code: 201, body: { result: "written", cid, type: body.type, value, status: body.status, version } };
      });
      res.status(outcome.code).json(outcome.body);
    } catch (err) {
      if (err instanceof StoreUnavailable) return unavailable(res, err);
      throw err;
    }
  }));

  // ---- steward / ops ----
  app.get("/v1/review", requireService, ah(async (_req, res) => {
    try {
      res.json({ items: await store.openReviews() });
    } catch (err) {
      if (err instanceof StoreUnavailable) return unavailable(res, err);
      throw err;
    }
  }));

  app.get("/v1/integrity", requireService, ah(async (_req, res) => {
    try {
      const [duplicates, copies, orphans] = await Promise.all([
        store.duplicateActiveIds(),
        store.copiesInStep(),
        store.orphanIds(),
      ]);
      res.json({
        duplicate_active_ids: duplicates,
        identifier_copies: { ...copies, in_step: copies.byId === copies.byPerson },
        ids_without_person: orphans,
      });
    } catch (err) {
      if (err instanceof StoreUnavailable) return unavailable(res, err);
      throw err;
    }
  }));

  app.use((err: unknown, req: Request, res: Response, _next: unknown) => {
    logger.error("unhandled", { id: (req as any).id, err: String(err) });
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  });

  app.listen(config.port, () => logger.info("resolver listening", { port: config.port }));
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
