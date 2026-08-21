import { ALLOWED_DELEGATED_ROLES, ALLOWED_DELEGATION_SCOPES, MAX_DELEGATION_DAYS } from "./config";

export interface DelegationInput {
  delegatedRole: string;
  scope: string;
  startsAt: string;
  endsAt: string;
  delegateSub: string;
  delegatorSub: string;
}

export type Check = { ok: true } | { ok: false; error: string };

// Pure delegation guardrails (unit-tested). The async "delegate is a CPO" and
// "delegator holds the authority" checks stay in the route.
export function validateDelegation(input: DelegationInput): Check {
  if (!ALLOWED_DELEGATED_ROLES.includes(input.delegatedRole)) {
    return { ok: false, error: "delegatedRole not allowed" };
  }
  if (!ALLOWED_DELEGATION_SCOPES.includes(input.scope)) {
    return { ok: false, error: "scope not allowed" };
  }
  if (input.delegateSub === input.delegatorSub) {
    return { ok: false, error: "cannot delegate to yourself" };
  }
  const start = new Date(input.startsAt).getTime();
  const end = new Date(input.endsAt).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) {
    return { ok: false, error: "invalid window" };
  }
  if ((end - start) / 86_400_000 > MAX_DELEGATION_DAYS) {
    return { ok: false, error: `window exceeds ${MAX_DELEGATION_DAYS} days` };
  }
  return { ok: true };
}
