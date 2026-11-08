import { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { timingSafeEqual } from "crypto";
import { config } from "./config";

const jwks = createRemoteJWKSet(
  new URL(`${config.internalUrl}/realms/${config.realm}/protocol/openid-connect/certs`),
);

/**
 * Who is calling:
 *  - kind "service": a back-office or batch caller with the registry API key; may read any record.
 *  - kind "citizen": a portal with the citizen's token; may read only records whose number is one
 *    of that citizen's IDs in Citizen 360 (checked per request).
 */
export type Caller = { kind: "service" } | { kind: "citizen"; cid: string; azp: string };

export interface CallerRequest extends Request {
  caller: Caller;
}

function apiKeyOk(req: Request): boolean {
  const given = req.header("x-api-key") ?? "";
  if (!config.apiKey || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(config.apiKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function identify(req: Request, res: Response, next: NextFunction) {
  if (apiKeyOk(req)) {
    (req as CallerRequest).caller = { kind: "service" };
    return next();
  }
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "send a citizen access token or X-Api-Key" });
  }
  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, { issuer: config.issuer });
    const azp = String((payload as Record<string, unknown>).azp ?? "");
    const cid = (payload as Record<string, unknown>).cid;
    if (!config.allowedAzp.includes(azp)) {
      return res.status(403).json({ error: `portal '${azp}' may not call the ${config.registry.key} registry` });
    }
    if (typeof cid !== "string") return res.status(401).json({ error: "token has no cid claim" });
    (req as CallerRequest).caller = { kind: "citizen", cid, azp };
    next();
  } catch (err) {
    console.warn("[auth] token rejected:", String(err));
    res.status(401).json({ error: "invalid token" });
  }
}

export function requireService(req: Request, res: Response, next: NextFunction) {
  if ((req as CallerRequest).caller?.kind !== "service") {
    return res.status(403).json({ error: "back-office API key required" });
  }
  next();
}

export class ResolverUnavailable extends Error {}

/**
 * The source records Citizen 360 links to this person ("<table>:<id>", from person_link),
 * via the Resolver profile API.
 *
 * Ownership is per record, not per number: legacy registries can hold two people's rows
 * under one number (NIS 4000099 in the seed), and owning the number must not reveal the
 * other person's row.
 */
export async function linkedRecords(cid: string): Promise<Set<string>> {
  let resp: globalThis.Response;
  try {
    resp = await fetch(`${config.resolverUrl}/v1/profile/${encodeURIComponent(cid)}`, {
      headers: { "X-Service-Key": config.resolverKey },
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    throw new ResolverUnavailable(String(err));
  }
  if (resp.status === 404) return new Set();
  if (!resp.ok) throw new ResolverUnavailable(`resolver answered ${resp.status}`);
  const body = (await resp.json()) as { links?: { source_record_id: string }[] };
  return new Set((body.links ?? []).map((l) => l.source_record_id));
}
