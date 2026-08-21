import { Router, Request, Response } from "express";
import { pool } from "./db";
import { auth } from "./auth";
import { writeAudit } from "./audit";
import { ah, validate } from "./http";
import * as kc from "./keycloakAdmin";
import { z } from "zod";
import { validateDelegation } from "./rules";

const createDelegationSchema = z.object({
  delegateSub: z.string().min(1),
  delegateEmail: z.string().email().optional(),
  delegatedRole: z.string().min(1),
  scope: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export interface Delegation {
  id: string;
  delegator_sub: string;
  delegator_email: string | null;
  delegate_sub: string;
  delegate_email: string | null;
  delegated_role: string;
  scope: string;
  ministry: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  status: string;
}

// The LIVE check: is there an active, in-window delegation right now? Because
// the window is evaluated at call time, authority auto-expires with no job.
export async function findActiveDelegation(
  delegateSub: string,
  scope: string,
  ministry: string,
): Promise<Delegation | null> {
  const { rows } = await pool.query(
    `SELECT * FROM delegations
      WHERE delegate_sub = $1 AND scope = $2 AND ministry = $3
        AND status = 'ACTIVE' AND now() BETWEEN starts_at AND ends_at
      ORDER BY ends_at DESC LIMIT 1`,
    [delegateSub, scope, ministry],
  );
  return rows[0] ?? null;
}

export function effectiveStatus(d: Delegation, now: number = Date.now()): string {
  if (d.status !== "ACTIVE") return d.status;
  return new Date(d.ends_at).getTime() < now ? "EXPIRED" : "ACTIVE";
}

export const delegationsRouter = Router();

// Create a delegation. Guardrails: only a holder of the delegated authority
// (MPS Permanent Secretary) or an admin may create it; role/scope allow-listed;
// duration capped; no self-delegation.
delegationsRouter.post("/", validate(createDelegationSchema), ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const canDelegate =
    (ctx.roles.includes("PERMANENT_SECRETARY") && ctx.agencyCode === "MPS") ||
    ctx.roles.includes("IT_ADMIN") ||
    ctx.roles.includes("MINISTRY_ADMIN");
  if (!canDelegate) {
    await writeAudit(ctx, { action: "CREATE_DELEGATION", resourceType: "DELEGATION", result: "DENIED" });
    return res.status(403).json({ error: "not authorised to delegate this authority" });
  }

  const { delegateSub, delegateEmail, delegatedRole, scope, startsAt, endsAt, reason } = req.body ?? {};

  const check = validateDelegation({ delegatedRole, scope, startsAt, endsAt, delegateSub, delegatorSub: ctx.sub });
  if (!check.ok) return res.status(400).json({ error: check.error });

  // Do NOT trust the client: the delegate must actually be an eligible CPO.
  if (!(await kc.userHasRealmRole(delegateSub, "CPO"))) {
    return res.status(400).json({ error: "delegate must be a CPO" });
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const { rows } = await pool.query(
    `INSERT INTO delegations
       (delegator_sub, delegator_email, delegate_sub, delegate_email, delegated_role,
        scope, ministry, starts_at, ends_at, reason, status, created_by_sub)
     VALUES ($1,$2,$3,$4,$5,$6,'MPS',$7,$8,$9,'ACTIVE',$1) RETURNING *`,
    [ctx.sub, ctx.email, delegateSub, delegateEmail ?? null, delegatedRole, scope, start.toISOString(), end.toISOString(), reason ?? null],
  );
  const d = rows[0] as Delegation;
  await writeAudit(ctx, {
    action: "CREATE_DELEGATION",
    resourceType: "DELEGATION",
    resourceRef: d.id,
    effectiveRole: "PERMANENT_SECRETARY",
    result: "SUCCESS",
  });
  res.status(201).json({ ...d, effectiveStatus: effectiveStatus(d) });
}));

// List delegations relevant to the caller (as delegator or delegate); admins see all MPS.
delegationsRouter.get("/", ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const isAdmin = ctx.roles.includes("IT_ADMIN") || ctx.roles.includes("MINISTRY_ADMIN");
  const { rows } = isAdmin
    ? await pool.query(`SELECT * FROM delegations WHERE ministry='MPS' ORDER BY created_at DESC`)
    : await pool.query(
        `SELECT * FROM delegations WHERE delegator_sub=$1 OR delegate_sub=$1 ORDER BY created_at DESC`,
        [ctx.sub],
      );
  res.json(rows.map((d: Delegation) => ({ ...d, effectiveStatus: effectiveStatus(d) })));
}));

// Revoke — instant, because the live check fails on the next request.
delegationsRouter.post("/:id/revoke", ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const { rows } = await pool.query(`SELECT * FROM delegations WHERE id=$1`, [req.params.id]);
  const d = rows[0] as Delegation | undefined;
  if (!d) return res.status(404).json({ error: "not found" });
  const isAdmin = ctx.roles.includes("IT_ADMIN") || ctx.roles.includes("MINISTRY_ADMIN");
  if (d.delegator_sub !== ctx.sub && !isAdmin) return res.status(403).json({ error: "forbidden" });

  await pool.query(
    `UPDATE delegations SET status='REVOKED', revoked_by_sub=$1, revoked_at=now() WHERE id=$2`,
    [ctx.sub, d.id],
  );
  await writeAudit(ctx, {
    action: "REVOKE_DELEGATION",
    resourceType: "DELEGATION",
    resourceRef: d.id,
    result: "SUCCESS",
  });
  res.json({ ok: true });
}));
