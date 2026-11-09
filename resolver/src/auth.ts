import { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { timingSafeEqual } from "crypto";
import { config } from "./config";

// Two kinds of caller:
//  * services (Keycloak SPI, seed loader, registry APIs, curl) send X-Service-Key
//  * portals (browsers) send the user's access token; they may only read their own profile

const jwks = createRemoteJWKSet(
  new URL(`${config.keycloakInternalUrl}/realms/${config.realm}/protocol/openid-connect/certs`),
);

export function isService(req: Request): boolean {
  const given = req.header("x-service-key") ?? "";
  if (!config.serviceKey || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(config.serviceKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireService(req: Request, res: Response, next: NextFunction) {
  if (!isService(req)) return res.status(401).json({ error: "service key required" });
  next();
}

/** Returns the token's cid claim, or null if the token is missing or invalid. */
export async function tokenCid(req: Request): Promise<string | null> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, { issuer: config.issuer });
    const cid = (payload as Record<string, unknown>).cid;
    return typeof cid === "string" ? cid : null;
  } catch (err) {
    console.warn("[auth] token rejected:", String(err));
    return null;
  }
}
