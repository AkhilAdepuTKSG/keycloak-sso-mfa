import { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "./config";

const jwks = createRemoteJWKSet(
  new URL(`${config.internalUrl}/realms/${config.realm}/protocol/openid-connect/certs`),
);

export interface CitizenContext {
  sub: string;
  username: string;
  email: string;
  name: string;
  roles: string[];
  ip?: string;
}

export interface AuthedRequest extends Request {
  auth: CitizenContext;
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

    const azp = (payload as any).azp;
    if (azp && !config.allowedAzp.includes(azp)) {
      return res.status(401).json({ error: "invalid token" });
    }

    (req as AuthedRequest).auth = {
      sub: String(payload.sub),
      username: (payload as any).preferred_username ?? "",
      email: (payload as any).email ?? "",
      name: (payload as any).name ?? (payload as any).preferred_username ?? "",
      roles: ((payload as any).realm_access?.roles ?? []) as string[],
      ip: req.ip,
    };
    next();
  } catch (err) {
    console.warn("[auth] token rejected:", String(err));
    res.status(401).json({ error: "invalid token" });
  }
}

export function auth(req: Request): CitizenContext {
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
