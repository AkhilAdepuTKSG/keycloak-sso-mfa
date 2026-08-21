import { pool } from "./db";
import { AuthContext } from "./auth";

export interface AuditInput {
  action: string;
  resourceType: string;
  resourceRef?: string | null;
  effectiveRole?: string | null;
  delegated?: boolean;
  delegatedBySub?: string | null;
  delegationId?: string | null;
  result: "SUCCESS" | "DENIED";
}

export async function writeAudit(ctx: AuthContext, e: AuditInput): Promise<void> {
  await pool.query(
    `INSERT INTO audit_events
       (actor_sub, actor_email, actor_agency, action, resource_type, resource_ref,
        effective_role, delegated, delegated_by_sub, delegation_id, result, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      ctx.sub,
      ctx.email,
      ctx.agencyCode,
      e.action,
      e.resourceType,
      e.resourceRef ?? null,
      e.effectiveRole ?? null,
      e.delegated ?? false,
      e.delegatedBySub ?? null,
      e.delegationId ?? null,
      e.result,
      ctx.ip ?? null,
    ],
  );
}
