import { Router, Request, Response } from "express";
import { pool } from "./db";
import { auth, requireRole } from "./auth";
import { writeAudit } from "./audit";
import { ah, validate } from "./http";
import { assignRealmRole } from "./keycloakAdmin";
import { z } from "zod";

export const enrolSchema = z.object({
  dateOfBirth: z.string().min(1).max(40),
  employmentStatus: z.enum(["EMPLOYED", "SELF_EMPLOYED", "UNEMPLOYED"]),
  address: z.string().max(500).optional(),
});

export const nisRouter = Router();

async function getMember(sub: string) {
  const { rows } = await pool.query(`SELECT * FROM nis_members WHERE sub=$1`, [sub]);
  return rows[0];
}

// Enrol the CURRENT citizen (self only). Allocates an NIS number, records the
// profile, then grants NIS_MEMBER via the service account. Idempotent.
nisRouter.post("/enrol", validate(enrolSchema), ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  if (await getMember(ctx.sub)) {
    return res.status(409).json({ error: "already enrolled in NIS" });
  }
  const { dateOfBirth, employmentStatus, address } = req.body ?? {};

  const nisNumber =
    "NIS" + String((await pool.query(`SELECT nextval('nis_seq') AS n`)).rows[0].n).padStart(8, "0");

  await pool.query(
    `INSERT INTO nis_members (sub, nis_number, email, details) VALUES ($1,$2,$3,$4)`,
    [ctx.sub, nisNumber, ctx.email, { dateOfBirth, employmentStatus, address: address ?? null }],
  );

  // Privileged step — performed by the backend via the service account, never
  // by the citizen. A token refresh on the client picks up the new role.
  await assignRealmRole(ctx.sub, "NIS_MEMBER");

  await writeAudit(ctx, { action: "NIS_ENROL", resourceType: "NIS_MEMBER", resourceRef: nisNumber, result: "SUCCESS" });
  res.status(201).json({ nisNumber });
}));

// Enrolment status — used by the portal to gate access (DB is the source of truth).
nisRouter.get("/me", ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const m = await getMember(ctx.sub);
  if (!m) return res.json({ enrolled: false });
  res.json({ enrolled: true, nisNumber: m.nis_number, details: m.details, enrolledAt: m.enrolled_at });
}));

// A protected NIS service — requires the NIS_MEMBER role AND resolves the
// caller's own record (ownership). Demonstrates SSO ≠ access.
nisRouter.get("/contributions", requireRole("NIS_MEMBER"), ah(async (req: Request, res: Response) => {
  const ctx = auth(req);
  const m = await getMember(ctx.sub);
  if (!m) return res.status(403).json({ error: "no NIS record" });
  res.json({
    nisNumber: m.nis_number,
    // stub data keyed to this citizen only
    contributions: [
      { period: "2026-06", amount: 4200, status: "PAID" },
      { period: "2026-07", amount: 4200, status: "PAID" },
    ],
  });
}));
