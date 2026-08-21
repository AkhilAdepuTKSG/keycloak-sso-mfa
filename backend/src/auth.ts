import { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config, PROCESSOR_ROLES } from "./config";

const jwks = createRemoteJWKSet(
  new URL(`${config.internalUrl}/realms/${config.realm}/protocol/openid-connect/certs`),
);

export interface AuthContext {
  sub: string;
  username: string;
  email: string;
  name: string;
  roles: string[];
  agencyPaths: string[];
  agencyCode: string | null;
  isOriginator: boolean;
  isMoPSStaff: boolean;
  ip?: string;
}

export interface AuthedRequest extends Request {
  auth: AuthContext;
}

export function deriveAgency(paths: string[]): string | null {
  for (const p of paths) {
    const seg = p.split("/").filter(Boolean); // "/Agencies/MOH/Originators" -> [Agencies, MOH, Originators]
    if (seg[0] === "Agencies" && seg[1]) return seg[1];
  }
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "missing bearer token" });

    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
    });

    // Reject tokens minted for a client we don't serve (authorized party).
    const azp = (payload as any).azp;
    if (azp && !config.allowedAzp.includes(azp)) {
      return res.status(401).json({ error: "invalid token" });
    }

    const roles = ((payload as any).realm_access?.roles ?? []) as string[];
    const agencyClaim = (payload as any).agency;
    const agencyPaths: string[] = Array.isArray(agencyClaim)
      ? agencyClaim
      : agencyClaim
        ? [agencyClaim]
        : [];
    const agencyCode = deriveAgency(agencyPaths);

    const ctx: AuthContext = {
      sub: String(payload.sub),
      username: (payload as any).preferred_username ?? "",
      email: (payload as any).email ?? "",
      name: (payload as any).name ?? (payload as any).preferred_username ?? "",
      roles,
      agencyPaths,
      agencyCode,
      isOriginator: roles.includes("AGENCY_ORIGINATOR"),
      isMoPSStaff: agencyCode === "MPS" && roles.some((r) => PROCESSOR_ROLES.includes(r)),
      ip: req.ip,
    };
    (req as AuthedRequest).auth = ctx;
    next();
  } catch (err) {
    console.warn("[auth] token rejected:", String(err));
    res.status(401).json({ error: "invalid token" });
  }
}

export function auth(req: Request): AuthContext {
  return (req as AuthedRequest).auth;
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = auth(req);
    if (!ctx || !roles.some((r) => ctx.roles.includes(r))) {
      return res.status(403).json({ error: "forbidden", need: roles });
    }
    next();
  };
}
