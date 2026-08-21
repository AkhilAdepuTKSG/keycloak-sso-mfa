import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { migrate, pool } from "./db";
import { auth, requireAuth, requireRole } from "./auth";
import { findActiveDelegation } from "./delegations";
import { workflowRouter } from "./workflow";
import { delegationsRouter } from "./delegations";
import { provisioningRouter } from "./provisioning";
import * as kc from "./keycloakAdmin";
import { ah, errorHandler, requestId, accessLog, logger } from "./http";

async function main() {
  await migrate();

  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(accessLog);

  app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }));

  // Rate limit + auth on everything under /api.
  app.use("/api", rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
  app.use("/api", requireAuth);

  // Who am I + my *effective* authority (roles + any active delegations right now).
  app.get("/api/me", ah(async (req: Request, res: Response) => {
    const ctx = auth(req);
    const active = await findActiveDelegation(ctx.sub, "EMPLOYMENT_APPROVAL", "MPS");
    res.json({
      sub: ctx.sub,
      username: ctx.username,
      email: ctx.email,
      name: ctx.name,
      agency: ctx.agencyCode,
      roles: ctx.roles,
      isOriginator: ctx.isOriginator,
      isMoPSStaff: ctx.isMoPSStaff,
      canProvision: ctx.roles.includes("IT_ADMIN") || ctx.roles.includes("MINISTRY_ADMIN"),
      canApproveAsPS:
        (ctx.roles.includes("PERMANENT_SECRETARY") && ctx.agencyCode === "MPS") || !!active,
      actingAsDelegate: active
        ? { role: active.delegated_role, delegatedBy: active.delegator_email, expiresAt: active.ends_at }
        : null,
    });
  }));

  // Directory lookup for MoPS staff (assign an HR officer; pick a delegate).
  // Returns only {sub,email,name} for a given role — no admin rights needed.
  app.get("/api/directory/users", ah(async (req: Request, res: Response) => {
    const ctx = auth(req);
    if (!ctx.isMoPSStaff) return res.status(403).json({ error: "MoPS staff only" });
    const role = String(req.query.role ?? "");
    const allowed = ["HR_OFFICER", "CPO", "PERMANENT_SECRETARY"];
    if (!allowed.includes(role)) return res.status(400).json({ error: "role not allowed", allowed });
    const users = await kc.getUsersByRole(role);
    res.json(
      users.map((u) => ({
        sub: u.id,
        email: u.email ?? "",
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username,
      })),
    );
  }));

  app.use("/api/employment-requests", workflowRouter);
  app.use("/api/delegations", delegationsRouter);
  app.use("/api/admin", provisioningRouter);

  // Business audit trail (admins only).
  app.get("/api/audit", requireRole("IT_ADMIN", "MINISTRY_ADMIN"), ah(async (_req: Request, res: Response) => {
    const { rows } = await pool.query(`SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 200`);
    res.json(rows);
  }));

  // Sanitized error handler — must be registered last.
  app.use(errorHandler);

  app.listen(config.port, () => logger.info("api listening", { port: config.port }));
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
