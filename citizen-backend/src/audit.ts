import { pool } from "./db";
import { CitizenContext } from "./auth";

export async function writeAudit(
  ctx: CitizenContext,
  e: { action: string; resourceType: string; resourceRef?: string | null; result: "SUCCESS" | "DENIED" },
): Promise<void> {
  await pool.query(
    `INSERT INTO citizen_audit_events (actor_sub, actor_email, action, resource_type, resource_ref, result, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ctx.sub, ctx.email, e.action, e.resourceType, e.resourceRef ?? null, e.result, ctx.ip ?? null],
  );
}
