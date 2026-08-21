# Government IAM POC — Citizen SSO + MoPS Workforce System

A runnable, production-*pattern* proof of a government-wide IAM built on Keycloak:

- **Citizen SSO** — one citizen identity across many service portals (`citizens` realm).
- **MoPS workforce system** — employees of many agencies, the employment-request
  **workflow**, **temporary delegation** of approval authority, **backend-mediated
  provisioning**, and a full **audit trail** (`gov` realm).

The architecture and the reasoning behind every decision are in [`docs/`](docs/README.md).
This README is how to **run and test** it.

> **Production patterns, locally runnable.** Keycloak runs in **production mode on
> PostgreSQL** (not `start-dev`), realms are hardened, and the backend is the source of
> truth for authorization. TLS/HA/secret-manager are the documented deploy step (see
> [Production hardening](#production-hardening)). HTTP on localhost keeps it runnable.

## Architecture at a glance

```
Browser ──OIDC (Auth Code + PKCE)──> Keycloak (prod mode) ──> PostgreSQL (keycloak db)
   │                                     realms: citizens, gov
   │ Bearer JWT
   ▼
Backend API (Node/Express/TS) ── validates JWT offline (JWKS) ──> authorize() ──> PostgreSQL (appdb)
   │  provisioning via service account (Keycloak Admin API)         workflow · delegation · audit
```

| Component | URL | Notes |
|---|---|---|
| Keycloak | http://localhost:8080 | admin from `.env` |
| Backend API | http://localhost:4000 | `/health`, `/api/*` |
| MPS Employee Portal | http://localhost:3100 | gov realm, full workflow UI |
| Citizen Portal (hub) | http://localhost:3000 | citizens realm |
| MPS / NIS / GPL citizen services | 3001 / 3002 / 3003 | citizens realm, SSO |
| PostgreSQL | (internal) | two DBs: `keycloak`, `appdb` |

## Run it

**Prerequisite:** Docker + Docker Compose.

```bash
cp .env.example .env      # then edit the passwords
docker compose up --build
```

First start builds the optimized Keycloak image, runs DB migrations, and imports both
realms (~1–2 min). When Keycloak logs it's ready, open **http://localhost:3100**.

Reset everything (re-import realms, wipe data): `docker compose down -v && docker compose up --build`.

## Seed users (all password `Password123!`)

**Government (`gov`) — MoPS Employee Portal (:3100):**

| Username | Agency | Role | MFA | In the portal |
|---|---|---|---|---|
| `ps.moh` | MOH | PERMANENT_SECRETARY + AGENCY_ORIGINATOR* | no | Agency Originator |
| `ps.mof` | MOF | PERMANENT_SECRETARY + AGENCY_ORIGINATOR* | no | Agency Originator |
| `head.moe` | MOE | AGENCY_ORIGINATOR* | no | Agency Originator |
| `emp.moh` | MOH | EMPLOYEE only | no | plain employee (cannot originate) |
| `cpo.mps` | MPS | CPO | **yes** | assign / endorse |
| `hr.mps` | MPS | HR_OFFICER | no | validate |
| `ps.mps` | MPS | PERMANENT_SECRETARY | **yes** | final approve |
| `minister.mps` | MPS | MINISTER | no | summary review |
| `itadmin.mps` | MPS | IT_ADMIN | **yes** | provisioning + audit |

\* `AGENCY_ORIGINATOR` is granted **only** via the agency's `/Originators` sub-group, not
by plain agency membership — so `emp.moh` (base MOH member) cannot raise requests. This is
the least-privilege "designated originator" model.

**MFA (conditional, approvers only):** `ps.mps`, `cpo.mps`, `itadmin.mps` have
`CONFIGURE_TOTP` — on first login they must set up an authenticator app, and are prompted
for a code thereafter. Others log in with password only. *To skip MFA while testing:* in
the Keycloak console → realm `gov` → the user → Required actions, remove "Configure OTP".

**Citizens (`citizens`):** `citizen` / `Password123!` (or self-register at :3000).

## Test — the employment workflow (end to end)

The flagship cross-agency flow (MOH raises a nurse post; MoPS processes it):

1. **Originate** — log in at :3100 as **`ps.moh`**. You get the *Agency Originator* view →
   **New Request** → "Registered Nurse" → submit. (Origin agency = MOH, handling = MPS.)
2. **Assign** — log in as **`cpo.mps`** (set up TOTP) → **Requests** → open the request →
   **Assign to HR** → pick `hr.mps`.
3. **Validate** — log in as **`hr.mps`** → open the request → **Mark validated**.
4. **Endorse** — back as **`cpo.mps`** → open the request → **Endorse → Permanent Secretary**.
5. **Approve** — log in as **`ps.mps`** → open the request → set a joining date →
   **Approve** → a **minute document** is generated and shown.
6. Every step appears in the request **History** with the effective role, and in the
   **Audit** trail (as `itadmin.mps`).

## Test — temporary delegation (auto-expiring)

1. As **`ps.mps`** → **Delegations** → *Delegate approval authority* → delegate = `cpo.mps`,
   window = now … +1 hour, reason "PS on leave" → create.
2. Take a request to the **ENDORSED** state (steps 1–4 above).
3. Log in as **`cpo.mps`** — the dashboard shows "acting as PERMANENT_SECRETARY_APPROVER".
   Open the endorsed request → **Approve** works, even though the CPO has no PS role.
   The minute + audit record `effectiveRole = PERMANENT_SECRETARY_APPROVER` and
   `delegatedBy = ps@mps.gov.gy`.
4. **Revoke** the delegation (or wait for the window to pass) → the CPO's Approve is denied
   again **immediately** — no token refresh, no cleanup job. The authority is checked live.

## Test — provisioning (IT admin)

Log in as **`itadmin.mps`** → **Provisioning**. Create a user, pick an agency, optionally
**Designate as Agency Originator**, assign standing roles. The backend performs it via the
`provisioning-service` account (the human never touches the Keycloak console), and the
action is audited. New users appear in the list and can log in (they set a password first).

## Test — citizen SSO (unchanged)

Open :3000, log in as `citizen`, and hop to MPS/NIS/GPL services with no re-login; log out
once to end the session everywhere. (See the citizen-side design in
[docs/07](docs/07-citizen-sso-and-identity-domains.md).)

## Test — NIS progressive enrolment (one identity, service-by-service)

NIS requires an NIS number the citizen doesn't have at registration. The portal gates
access and enrols them onto their **existing** identity — no new account.

1. Log in at **http://localhost:3002** (NIS) as `citizen` / `Password123!`. You're
   authenticated (SSO) but see **"🔒 NIS registration required"** — you have no `NIS_MEMBER`.
2. Fill the NIS form → **Register**. The `citizen-backend` allocates an NIS number, stores
   the profile, and — via the `citizen-provisioning-service` account — grants `NIS_MEMBER`
   to *your* user (you never self-assign it).
3. The portal **refreshes your token** (so the new role appears) and shows your **NIS number
   + contributions** — served by a role-gated endpoint that also checks ownership by `sub`.
4. Citizen data isolation: `/api/nis/contributions` returns only *your* record; another
   citizen can never see it even though both are `NIS_MEMBER`.

This is the **same backend-mediated pattern** as MoPS provisioning — a citizen triggers it,
the backend authorizes and performs the privileged Keycloak write via a service account.
It generalizes to GPL/GRA (`*_MEMBER` role + their own service DB).

## The Keycloak ↔ application boundary (the whole point)

| Keycloak owns | The application owns |
|---|---|
| Authentication, SSO, sessions, MFA | JWT validation (offline, JWKS) |
| Identity, credentials, **coarse realm roles** | Ministry/agency scoping, resource ownership |
| Group membership → `agency` claim | **Workflow state machine** |
| Token issuance | **Cross-agency origination**, **temporary delegation** (live-evaluated) |
| Auth/admin events | **Business audit trail** (effective role + delegation lineage) |

Delegation and "which agency you can act for" are **never** in the token and **never**
Keycloak roles — they're app data evaluated per request, so revocation/expiry is instant.

## Security hardening included

- Two realms (citizen vs employee security domains); `sslRequired: external`.
- **Brute-force protection on**; password policy (`length(10)+special` gov, `length(8)` citizens).
- **Conditional MFA** for MoPS approvers (TOTP).
- **No ROPC anywhere** (`directAccessGrantsEnabled: false`) — Auth Code + PKCE only.
- Least-privilege **designated originators** (sub-group, not blanket agency membership).
- Backend validates `iss`/`aud`/`exp`/**`azp`** offline; provisioning is backend-mediated + audited.
- Delegation guardrails: allow-listed role/scope, capped duration, no self/re-delegation, revocable.
- **API hardening (Tier 1 #3):** `helmet` security headers, **rate limiting** (stricter on public enrolment), body-size limits, and **schema validation (zod)** on every mutating endpoint.
- **Correctness (P0):** atomic workflow transitions (no double-approve), server-side verification of client-supplied subjects, sanitized error responses.
- **Observability (Tier 1 #6):** structured JSON logs with **request-id correlation** and access logs (no tokens/PII).

## Production hardening — status

**Done (Tier 1):**
- **#1 DB migrations** — versioned, tracked, transactional migration runner (`schema_migrations` / `citizen_schema_migrations`); schema-on-boot removed. Add a numbered `*.sql` under `src/migrations/` to evolve the schema.
- **#3 API hardening** — helmet, rate limiting, body limits, `azp` allow-list, zod validation.
- **#5 Tests + CI** — unit tests for the security-critical pure logic (both backends) + GitHub Actions CI (build/typecheck/test + docker build). Integration tests scaffolded — see [docs/TESTING.md](docs/TESTING.md).
- **#6 Observability** — structured JSON logging + request-id correlation + access logs.
- Plus the P0 correctness/security fixes (atomic transitions, subject verification, sanitized errors).

**Remaining:**
- **#2 Secrets manager** — remove client secrets from realm JSON/`.env`; inject at deploy; rotate. Least-privilege DB user (currently the app connects as the Postgres superuser).
- **#4 TLS + HA** — terminate TLS at ingress; Keycloak clustered; external secrets.
- **#5 (integration)** — provision a CI-only test client to mint tokens, then enable the integration job.
- **#7 role-conditional MFA**, **BFF pattern**, **fine-grained admin scoping**, **IdP federation**, **SIEM/backups/DR** — see the full backlog.

## Project layout

```
docker-compose.yml          Postgres + Keycloak(prod) + backend + workforce SPA + citizen SPAs
.env.example                secrets template
keycloak/                   Dockerfile (optimized build) + realms/{citizens,gov}-realm.json
database/init/              creates the keycloak + appdb databases
backend/                    Node/Express/TS API (auth, workflow, delegation, provisioning, audit)
mops-portal/                React workforce SPA (full workflow UI)
frontend/                   React citizen SPA (SSO portals)
docs/                       architecture, identity/authorization model, delegation, answers
```
