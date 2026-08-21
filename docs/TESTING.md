# Testing

## Layers

| Layer | What it covers | Runs where | Status |
|-------|----------------|------------|--------|
| **Unit** | Pure authorization/domain logic (agency derivation, delegation window rules, effective-status, input schemas) | anywhere, no infra | ✅ automated |
| **Build/typecheck** | Every backend + frontend compiles | CI | ✅ automated |
| **Integration** | Real HTTP against the live stack (workflow, authz denials, delegation expiry, NIS enrol) | needs Docker stack + a test token | ⚙️ scaffold (see below) |
| **Manual/E2E** | Click-through of each persona | local browser | ✅ documented in the [README](../README.md) |

## Run the unit tests

```bash
cd backend && npm ci && npm test          # gov: deriveAgency, effectiveStatus, validateDelegation
cd citizen-backend && npm ci && npm test  # citizen: NIS enrol schema
```

Tests use the built-in Node test runner (`node:test`) via `tsx` — no extra frameworks.
They exercise the **pure** functions that back the security-critical decisions:

- `deriveAgency()` — agency code from the group-membership claim.
- `validateDelegation()` — allow-listed role/scope, no self-delegation, valid + capped window.
- `effectiveStatus()` — a delegation reads `EXPIRED` past its window (the auto-expiry guarantee).
- `enrolSchema` — NIS registration input validation.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push/PR:

- **backends** matrix → `npm ci` → `npm run build` → `npm test`
- **frontends** matrix → `npm ci` → `npm run build`
- **docker-build** → `docker compose build`

Add image/dependency scanning (e.g. Trivy, `npm audit`) as a follow-on.

## Integration tests (scaffold)

Integration tests need (a) the running stack and (b) a **user access token**. Because the
production clients have `directAccessGrantsEnabled: false` (no ROPC — deliberate), CI must
mint tokens through a **dedicated test client** rather than the real portals. Recommended:

1. Import a **separate test realm** (or add a `automated-tests` client with direct grants)
   in a CI-only compose override — never in the production realms.
2. Fetch tokens for each seeded persona via the token endpoint.
3. Assert, per persona, that:
   - the happy-path workflow advances (originate → assign → validate → endorse → approve → minute);
   - **every cross-role action is denied** (e.g. HR cannot endorse; a non-approver cannot approve);
   - a delegation lets the CPO approve **only** within its window, and is denied after expiry/revoke;
   - NIS `/contributions` is denied before enrolment and returns only the caller's record after.

The CI job is stubbed (commented) in `ci.yml` until the test-client provisioning is added.
