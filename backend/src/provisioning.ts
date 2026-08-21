import { Router, Request, Response } from "express";
import { auth, requireRole } from "./auth";
import { writeAudit } from "./audit";
import { pool } from "./db";
import { ah, validate } from "./http";
import * as kc from "./keycloakAdmin";
import { z } from "zod";

const createUserSchema = z.object({
  username: z.string().min(3).max(60),
  email: z.string().email(),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  password: z.string().min(10),
  agency: z.string().min(2).max(10),
  designateOriginator: z.boolean().optional(),
  roles: z.array(z.string()).optional(),
});

// All routes here require IT_ADMIN. The human never touches Keycloak directly —
// the backend authorizes, then acts via the `provisioning-service` account.
// With scope (ii) the MoPS IT admin manages the whole workforce population;
// a stricter per-agency model would add an agency check here.
export const provisioningRouter = Router();
provisioningRouter.use(requireRole("IT_ADMIN", "MINISTRY_ADMIN"));

provisioningRouter.get("/agencies", ah(async (_req: Request, res: Response) => {
  const { rows } = await pool.query(`SELECT code, name FROM agencies ORDER BY code`);
  res.json(rows.map((a: any) => ({ ...a, canOriginate: a.code !== "MPS" })));
}));

provisioningRouter.get("/users", ah(async (_req: Request, res: Response) => {
  res.json(await kc.listUsers());
}));

provisioningRouter.get("/users/:id", ah(async (req: Request, res: Response) => {
  const [groups, roles] = await Promise.all([
    kc.getUserGroups(req.params.id),
    kc.getUserRealmRoles(req.params.id),
  ]);
  res.json({ groups, roles: roles.map((r) => r.name) });
}));

provisioningRouter.post("/users", validate(createUserSchema), ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const { username, email, firstName, lastName, password, agency, designateOriginator, roles } = req.body ?? {};
  try {
    const id = await kc.createUser({
      username, email,
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      password, agency,
      designateOriginator: !!designateOriginator,
      roles: Array.isArray(roles) ? roles : [],
    });
    await writeAudit(ctx, { action: "PROVISION_USER", resourceType: "USER", resourceRef: username, effectiveRole: "IT_ADMIN", result: "SUCCESS" });
    res.status(201).json({ id });
  } catch (err) {
    // Log the real cause; return a safe, generic message (no upstream text).
    console.error("[provisioning] create user failed:", err);
    await writeAudit(ctx, { action: "PROVISION_USER", resourceType: "USER", resourceRef: username, effectiveRole: "IT_ADMIN", result: "DENIED" });
    res.status(400).json({ error: "could not provision user — check username/email uniqueness and password policy" });
  }
}));

provisioningRouter.post("/users/:id/roles", ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const { add } = req.body ?? {};
  await kc.assignRoles(req.params.id, Array.isArray(add) ? add : []);
  await writeAudit(ctx, { action: "ASSIGN_ROLES", resourceType: "USER", resourceRef: req.params.id, effectiveRole: "IT_ADMIN", result: "SUCCESS" });
  res.json({ ok: true });
}));

provisioningRouter.post("/users/:id/originator", ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const { agency, designate } = req.body ?? {};
  if (!agency) return res.status(400).json({ error: "agency required" });
  await kc.setOriginator(req.params.id, agency, !!designate);
  await writeAudit(ctx, { action: designate ? "DESIGNATE_ORIGINATOR" : "REMOVE_ORIGINATOR", resourceType: "USER", resourceRef: req.params.id, effectiveRole: "IT_ADMIN", result: "SUCCESS" });
  res.json({ ok: true });
}));
