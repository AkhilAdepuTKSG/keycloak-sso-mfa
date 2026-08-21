import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAgency } from "./auth";
import { effectiveStatus } from "./delegations";
import { validateDelegation } from "./rules";

test("deriveAgency picks the agency code from a group path", () => {
  assert.equal(deriveAgency(["/Agencies/MOH/Originators"]), "MOH");
  assert.equal(deriveAgency(["/Agencies/MPS"]), "MPS");
  assert.equal(deriveAgency(["/Other/X", "/Agencies/MOF"]), "MOF");
  assert.equal(deriveAgency([]), null);
  assert.equal(deriveAgency(["/Other/X"]), null);
});

test("effectiveStatus reflects the time window", () => {
  const now = Date.parse("2026-08-12T12:00:00Z");
  const expired = { status: "ACTIVE", ends_at: "2026-08-12T00:00:00Z" } as any;
  const active = { status: "ACTIVE", ends_at: "2026-08-12T23:59:00Z" } as any;
  assert.equal(effectiveStatus(expired, now), "EXPIRED");
  assert.equal(effectiveStatus(active, now), "ACTIVE");
  assert.equal(effectiveStatus({ status: "REVOKED", ends_at: "2026-08-12T23:59:00Z" } as any, now), "REVOKED");
});

test("validateDelegation enforces allow-lists, self-check and window", () => {
  const base = {
    delegatedRole: "PERMANENT_SECRETARY_APPROVER",
    scope: "EMPLOYMENT_APPROVAL",
    startsAt: "2026-08-12T00:00:00Z",
    endsAt: "2026-08-12T23:59:00Z",
    delegateSub: "cpo-sub",
    delegatorSub: "ps-sub",
  };
  assert.equal(validateDelegation(base).ok, true);
  assert.equal(validateDelegation({ ...base, delegatedRole: "ADMIN" }).ok, false);
  assert.equal(validateDelegation({ ...base, scope: "ANYTHING" }).ok, false);
  assert.equal(validateDelegation({ ...base, delegateSub: "ps-sub" }).ok, false); // self
  assert.equal(validateDelegation({ ...base, endsAt: "2026-08-11T00:00:00Z" }).ok, false); // end <= start
  assert.equal(validateDelegation({ ...base, endsAt: "2026-09-30T00:00:00Z" }).ok, false); // too long
});
