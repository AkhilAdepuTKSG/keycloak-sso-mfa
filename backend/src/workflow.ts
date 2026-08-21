import { Router, Request, Response } from "express";
import { pool } from "./db";
import { auth, AuthContext, requireRole } from "./auth";
import { writeAudit } from "./audit";
import { findActiveDelegation } from "./delegations";
import { ah, validate } from "./http";
import * as kc from "./keycloakAdmin";
import { z } from "zod";

const createSchema = z.object({
  positionTitle: z.string().min(1).max(200),
  details: z.record(z.any()).optional(),
});
const assignSchema = z.object({
  assignedToSub: z.string().min(1),
  assignedToEmail: z.string().email().optional(),
});
const noteSchema = z.object({
  note: z.string().max(2000).optional(),
  effectiveJoiningDate: z.string().max(40).optional(),
});

export const STATUS = {
  SUBMITTED: "SUBMITTED",
  ASSIGNED_TO_HR: "ASSIGNED_TO_HR",
  VALIDATED: "VALIDATED",
  ENDORSED: "ENDORSED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

interface EmploymentRequest {
  id: string;
  reference: string;
  position_title: string;
  origin_agency: string;
  handling_agency: string;
  status: string;
  created_by_sub: string;
  assigned_to_sub: string | null;
  details: any;
}

async function getRequest(id: string): Promise<EmploymentRequest | undefined> {
  const { rows } = await pool.query(`SELECT * FROM employment_requests WHERE id=$1`, [id]);
  return rows[0];
}

// Atomic state change. The UPDATE only fires when the row is still in the
// expected status, so concurrent actors cannot double-transition (no TOCTOU).
// Returns the updated row, or null (and sends the right 404/409) if it missed.
async function guardedTransition(
  res: Response,
  id: string,
  expected: string,
  next: string,
  extraWhere = "",
  extraParams: unknown[] = [],
): Promise<EmploymentRequest | null> {
  const { rows, rowCount } = await pool.query(
    `UPDATE employment_requests SET status=$1, updated_at=now()
      WHERE id=$2 AND status=$3 ${extraWhere}
      RETURNING *`,
    [next, id, expected, ...extraParams],
  );
  if (rowCount === 0) {
    const current = await getRequest(id);
    if (!current) res.status(404).json({ error: "not found" });
    else res.status(409).json({ error: `request is in state ${current.status}` });
    return null;
  }
  return rows[0] as EmploymentRequest;
}

async function recordTransition(
  requestId: string,
  from: string | null,
  to: string,
  action: string,
  ctx: AuthContext,
  effectiveRole: string,
  opts: { delegatedBySub?: string | null; delegationId?: string | null; note?: string | null } = {},
) {
  await pool.query(
    `INSERT INTO workflow_transitions
       (request_id, from_status, to_status, action, actor_sub, actor_email, effective_role,
        delegated_by_sub, delegation_id, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [requestId, from, to, action, ctx.sub, ctx.email, effectiveRole, opts.delegatedBySub ?? null, opts.delegationId ?? null, opts.note ?? null],
  );
}

async function resolveApprover(ctx: AuthContext) {
  if (ctx.roles.includes("PERMANENT_SECRETARY") && ctx.agencyCode === "MPS") {
    return { ok: true as const, effectiveRole: "PERMANENT_SECRETARY", delegation: null };
  }
  const d = await findActiveDelegation(ctx.sub, "EMPLOYMENT_APPROVAL", "MPS");
  if (d && d.delegated_role === "PERMANENT_SECRETARY_APPROVER") {
    return { ok: true as const, effectiveRole: "PERMANENT_SECRETARY_APPROVER", delegation: d };
  }
  return { ok: false as const };
}

export const workflowRouter = Router();

// --- Originate --------------------------------------------------------------
workflowRouter.post("/", requireRole("AGENCY_ORIGINATOR"), validate(createSchema), ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const { positionTitle, details } = req.body ?? {};
  if (ctx.agencyCode === "MPS") return res.status(400).json({ error: "MPS does not originate into itself" });

  const ref = (await pool.query(`SELECT 'REQ-'||nextval('req_seq') AS ref`)).rows[0].ref as string;
  const { rows } = await pool.query(
    `INSERT INTO employment_requests
       (reference, position_title, origin_agency, handling_agency, status, created_by_sub, created_by_email, details)
     VALUES ($1,$2,$3,'MPS',$4,$5,$6,$7) RETURNING *`,
    [ref, positionTitle, ctx.agencyCode, STATUS.SUBMITTED, ctx.sub, ctx.email, details ?? {}],
  );
  const reqRow = rows[0] as EmploymentRequest;
  await recordTransition(reqRow.id, null, STATUS.SUBMITTED, "ORIGINATE", ctx, "AGENCY_ORIGINATOR");
  await writeAudit(ctx, { action: "ORIGINATE_REQUEST", resourceType: "EMPLOYMENT_REQUEST", resourceRef: ref, effectiveRole: "AGENCY_ORIGINATOR", result: "SUCCESS" });
  res.status(201).json(reqRow);
}));

// --- List (scoped) ----------------------------------------------------------
workflowRouter.get("/", ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  if (ctx.isMoPSStaff) {
    const { rows } = await pool.query(`SELECT * FROM employment_requests WHERE handling_agency='MPS' ORDER BY created_at DESC`);
    return res.json(rows);
  }
  if (ctx.isOriginator && ctx.agencyCode) {
    const { rows } = await pool.query(`SELECT * FROM employment_requests WHERE origin_agency=$1 ORDER BY created_at DESC`, [ctx.agencyCode]);
    return res.json(rows);
  }
  res.json([]);
}));

// --- Detail -----------------------------------------------------------------
workflowRouter.get("/:id", ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const reqRow = await getRequest(req.params.id);
  if (!reqRow) return res.status(404).json({ error: "not found" });
  const permitted = ctx.isMoPSStaff || (ctx.isOriginator && reqRow.origin_agency === ctx.agencyCode);
  if (!permitted) return res.status(403).json({ error: "forbidden" });

  const transitions = (await pool.query(`SELECT * FROM workflow_transitions WHERE request_id=$1 ORDER BY created_at`, [reqRow.id])).rows;
  const minute = (await pool.query(`SELECT * FROM minutes WHERE request_id=$1`, [reqRow.id])).rows[0] ?? null;
  res.json({ ...reqRow, transitions, minute });
}));

// --- CPO assigns to an HR officer (verifies the target actually holds HR_OFFICER) ---
workflowRouter.post("/:id/assign", requireRole("CPO"), validate(assignSchema), ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  if (ctx.agencyCode !== "MPS") return res.status(403).json({ error: "MPS CPO only" });
  const { assignedToSub, assignedToEmail } = req.body ?? {};

  // Do NOT trust the client: confirm the target is really an HR officer.
  if (!(await kc.userHasRealmRole(assignedToSub, "HR_OFFICER"))) {
    return res.status(400).json({ error: "assignee is not an HR officer" });
  }

  const row = await guardedTransition(
    res, req.params.id, STATUS.SUBMITTED, STATUS.ASSIGNED_TO_HR,
    ", assigned_to_sub=$4, assigned_to_email=$5", [assignedToSub, assignedToEmail ?? null],
  );
  if (!row) return;
  await recordTransition(row.id, STATUS.SUBMITTED, STATUS.ASSIGNED_TO_HR, "ASSIGN", ctx, "CPO");
  await writeAudit(ctx, { action: "ASSIGN_REQUEST", resourceType: "EMPLOYMENT_REQUEST", resourceRef: row.reference, effectiveRole: "CPO", result: "SUCCESS" });
  res.json({ ok: true });
}));

// --- HR validates (assignment enforced atomically in the WHERE clause) ------
workflowRouter.post("/:id/validate", requireRole("HR_OFFICER"), ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const row = await guardedTransition(
    res, req.params.id, STATUS.ASSIGNED_TO_HR, STATUS.VALIDATED,
    "AND assigned_to_sub=$4", [ctx.sub],
  );
  if (!row) {
    // guardedTransition already answered 404/409; a 409 here may actually mean
    // "assigned to someone else" — clarify without leaking internals.
    return;
  }
  await recordTransition(row.id, STATUS.ASSIGNED_TO_HR, STATUS.VALIDATED, "VALIDATE", ctx, "HR_OFFICER", { note: req.body?.note ?? null });
  await writeAudit(ctx, { action: "VALIDATE_REQUEST", resourceType: "EMPLOYMENT_REQUEST", resourceRef: row.reference, effectiveRole: "HR_OFFICER", result: "SUCCESS" });
  res.json({ ok: true });
}));

// --- CPO endorses -----------------------------------------------------------
workflowRouter.post("/:id/endorse", requireRole("CPO"), ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  if (ctx.agencyCode !== "MPS") return res.status(403).json({ error: "MPS CPO only" });
  const row = await guardedTransition(res, req.params.id, STATUS.VALIDATED, STATUS.ENDORSED);
  if (!row) return;
  await recordTransition(row.id, STATUS.VALIDATED, STATUS.ENDORSED, "ENDORSE", ctx, "CPO");
  await writeAudit(ctx, { action: "ENDORSE_REQUEST", resourceType: "EMPLOYMENT_REQUEST", resourceRef: row.reference, effectiveRole: "CPO", result: "SUCCESS" });
  res.json({ ok: true });
}));

// --- PS (or delegate) approves / rejects / sends back -----------------------
async function approverAction(req: Request, res: Response, kind: "approve" | "reject" | "send-back") {
  const ctx = auth(req);
  const authz = await resolveApprover(ctx);
  if (!authz.ok) {
    const existing = await getRequest(req.params.id);
    await writeAudit(ctx, { action: `${kind.toUpperCase()}_REQUEST`, resourceType: "EMPLOYMENT_REQUEST", resourceRef: existing?.reference ?? req.params.id, result: "DENIED" });
    return res.status(403).json({ error: "requires Permanent Secretary authority (standing or delegated)" });
  }
  const delegated = authz.effectiveRole === "PERMANENT_SECRETARY_APPROVER";
  const lineage = { delegatedBySub: delegated ? authz.delegation!.delegator_sub : null, delegationId: delegated ? authz.delegation!.id : null };

  const toStatus = kind === "approve" ? STATUS.APPROVED : kind === "reject" ? STATUS.REJECTED : STATUS.ASSIGNED_TO_HR;
  const action = kind === "approve" ? "APPROVE" : kind === "reject" ? "REJECT" : "SEND_BACK";

  const row = await guardedTransition(res, req.params.id, STATUS.ENDORSED, toStatus);
  if (!row) return;

  await recordTransition(row.id, STATUS.ENDORSED, toStatus, action, ctx, authz.effectiveRole, { ...lineage, note: req.body?.note ?? null });

  if (kind === "approve") {
    const doc = {
      reference: row.reference,
      positionTitle: row.position_title,
      originAgency: row.origin_agency,
      handlingAgency: row.handling_agency,
      approvedBy: ctx.email,
      approvingAuthority: authz.effectiveRole,
      delegatedBy: delegated ? authz.delegation!.delegator_email : null,
      effectiveJoiningDate: req.body?.effectiveJoiningDate ?? null,
      approvedAt: new Date().toISOString(),
    };
    await pool.query(`INSERT INTO minutes (request_id, document) VALUES ($1,$2)`, [row.id, doc]);
  }

  await writeAudit(ctx, {
    action: `${action}_REQUEST`,
    resourceType: "EMPLOYMENT_REQUEST",
    resourceRef: row.reference,
    effectiveRole: authz.effectiveRole,
    delegated,
    delegatedBySub: lineage.delegatedBySub,
    delegationId: lineage.delegationId,
    result: "SUCCESS",
  });
  res.json({ ok: true, effectiveRole: authz.effectiveRole, delegated });
}

workflowRouter.post("/:id/approve", ah((req, res) => approverAction(req, res, "approve")));
workflowRouter.post("/:id/reject", ah((req, res) => approverAction(req, res, "reject")));
workflowRouter.post("/:id/send-back", ah((req, res) => approverAction(req, res, "send-back")));
