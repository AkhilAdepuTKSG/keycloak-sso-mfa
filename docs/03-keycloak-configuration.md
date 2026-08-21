# 03 — Keycloak Configuration (Phase 3)

## Part A — Realms

| Realm | Purpose | Registration | Portals (clients) |
|-------|---------|--------------|-------------------|
| `citizens` | External citizens — **one government-wide citizen identity**, SSO across all ministry citizen-services | Self-registration **ON**, email verify | `citizen-portal`, `moh-citizen-services`, `mops-citizen-services`, `mof-citizen-services` |
| `gov` | All government employees, all ministries | Self-registration **OFF** (provisioned) | `moh-portal`, `mops-portal`, `gov-admin-portal`, `backend-api` |

## Part B — Clients

### B.1 `citizens` realm — one identity, ministry services as clients (enables gov-wide Citizen SSO)

| Client | Type | Flow | Notes |
|--------|------|------|-------|
| `citizen-portal` | public (SPA) | Auth Code + PKCE | Central entry point. Audience must **never** include internal APIs' scopes. |
| `moh-citizen-services` | public (SPA) | Auth Code + PKCE | MOH health services / applications. |
| `mops-citizen-services` | public (SPA) | Auth Code + PKCE | MOPS scholarship / job applications. |
| `mof-citizen-services` | public (SPA) | Auth Code + PKCE | MOF tax / financial services. |
| `citizen-api` | bearer-only | — | Validates citizen tokens; enforces **resource ownership** + per-ministry service rules. |

All four SPA clients share the **one `citizens`-realm SSO session** → the citizen logs in once at `citizen-portal` and reaches every ministry service via silent SSO. Onboarding a new ministry's citizen services = **add one client here**. Full analysis: **[07](07-citizen-sso-and-identity-domains.md)**.

### B.2 `gov` realm — internal employee portals

| Client | Type | Flow | Notes |
|--------|------|------|-------|
| `moh-portal` | public (SPA) | Auth Code + PKCE | Internal MOH. |
| `mops-portal` | public (SPA) | Auth Code + PKCE | Where cross-ministry origination happens. |
| `gov-admin-portal` | public (SPA) | Auth Code + PKCE | Optional admin UI. |
| `backend-api` | bearer-only / confidential | — | The **audience** (`aud`) internal portals request; validates tokens, never initiates login. |

**Audience & issuer strategy:** internal portals request the `backend-api` audience via an *audience mapper* / client scope, so every token the internal API receives has `aud: backend-api` and `iss = .../realms/gov`. Citizen tokens have `iss = .../realms/citizens` and a citizen audience only — so **a citizen token can never satisfy an internal (employee) API check, and vice-versa**. The backend derives an *identity domain* from the issuer (see [07 Part F](07-citizen-sso-and-identity-domains.md)).

### B.3 Citizen SSO session & single logout (in `citizens` realm)

| Setting | Value / mechanism |
|---------|-------------------|
| SSO session idle / max | Tuned independently of `gov` (e.g. 30 min idle / 8 h max). |
| Login | Once at `citizen-portal`; other clients use the existing session (silent Auth Code + PKCE). |
| **Single logout** | OIDC **RP-initiated logout** ends the realm SSO session; **back-channel logout** enabled on each citizen-service client so one logout terminates the session everywhere. |
| Access token | Short (~5 min) + refresh rotation, as in `gov`. |

## Part C — Roles

### C.1 Realm roles (business capabilities — coarse, cross-cutting) — **USE**

`gov` realm roles:

| Role | Meaning |
|------|---------|
| `EMPLOYEE` | Base role for every government employee. |
| `HR_OFFICER` | Can validate documents in a workflow. |
| `CPO` | Chief Personnel Officer: assign & endorse. |
| `PERMANENT_SECRETARY` | High authority; final approval within own ministry. |
| `AGENCY_ORIGINATOR` | May originate cross-ministry employment requests. |
| `MINISTRY_ADMIN` | Group-scoped admin (see Part G). |

`citizens` realm role: `CITIZEN`.

> **Why realm roles (not client roles) for these:** these capabilities are **cross-client** — a CPO is a CPO whether acting through `mops-portal` or a future `treasury-portal`, and the `backend-api` (one client) is where they're enforced. Realm roles keep one authoritative definition and avoid duplicating the same role across every client.

### C.2 Client roles — **USE SPARINGLY**

Reserve client roles for **UI-only, app-specific** capabilities that never leave one client, e.g. `mops-portal:VIEW_DASHBOARD_ANALYTICS`. Business/workflow authority is **not** modelled as client roles, because it is enforced in `backend-api` and shared across portals. For this POC we keep business roles as realm roles and use no client roles (documented so reviewers see the deliberate choice).

### C.3 What roles do NOT model

`PERMANENT_SECRETARY_APPROVER` (the *delegated* acting role) is **not** a Keycloak role. It exists only as a value inside a `delegations` record and is evaluated live. Making it a Keycloak role would risk it becoming permanent — exactly the anti-pattern the brief warns against.

## Part D — Groups & hierarchy — **USE (this is how ministries are modelled)**

```
gov realm groups:
/Ministries
   /MOH
   /MOPS
   /MOF
```

- Each ministry subgroup carries a **group attribute** `ministry_code = MOH|MOPS|MOF`.
- A user's membership in `/Ministries/MOH` + their `home_ministry` attribute together express their home ministry. (Group gives structure & admin scoping; attribute gives an easy token claim.)
- **Onboarding a ministry = add one subgroup** (+ optional default roles on it). No realm, no client duplication.
- Group role mappings can auto-grant `EMPLOYEE` to everyone under `/Ministries/*`.

> **Keycloak Organizations (KC 25+) — evaluated, deferred.** Organizations could replace `/Ministries/*` if per-ministry **federated IdPs** become a requirement (each ministry brings its own directory). For this POC, groups+attribute are simpler, import-friendly, and sufficient. Recommendation: revisit Organizations at production scale if ministries federate their own IdPs.

## Part E — User attributes — **USE**

| Attribute | Example | Purpose |
|-----------|---------|---------|
| `user_type` | `GOVERNMENT_EMPLOYEE` | Distinguishes populations (also implied by realm). |
| `home_ministry` | `MOH` | Ministry context claim → drives Ministry-Based Access Control. |
| `position` | `PERMANENT_SECRETARY` | Organisational position (distinct from role). |

Declared in the realm's **User Profile** (declarative user profile) so they're validated and editable in the admin console.

## Part F — Client scopes, protocol mappers, claims — **USE (carefully)**

A dedicated client scope `gov-context` (default for internal portals) adds mappers:

| Mapper | Type | Emits claim |
|--------|------|-------------|
| home_ministry | User Attribute → token | `home_ministry` |
| position | User Attribute → token | `position` |
| user_type | User Attribute → token | `user_type` |
| realm roles | Realm Role → token | `realm_access.roles` |
| audience | Audience mapper | `aud: backend-api` |

**Not** mapped: responsibilities, delegations (they don't exist in Keycloak). This is the enforcement of the thin-token principle at the config level.

## Part G — Admin roles & ministry admin isolation — **USE (fine-grained)**

Requirement (brief Q21): one ministry's admins must not manage another ministry's users.

- Do **not** grant ministry admins `realm-admin`.
- Grant a **group-scoped** fine-grained admin: `MINISTRY_ADMIN` for MOH gets `manage-users`/`view-users` **restricted to the `/Ministries/MOH` subgroup** via Keycloak's fine-grained admin permissions (or via the app's delegated-admin screen calling the Admin API scoped to that group).
- Realm-level configuration (clients, roles, flows) stays with a central platform team.

## Part H — Authentication flows, IdPs, sessions — **USE / EVALUATE**

| Concept | Decision |
|---------|----------|
| **Authentication flows** | USE. `citizens`: username/password + email verify + (future) social/national-ID IdP. `gov`: username/password + (production) OTP/MFA + (future) government-directory LDAP or brokered IdP. |
| **Identity providers** | EVALUATE/FUTURE. `gov` can broker a central government directory; `citizens` can broker national-ID/social. Not required for the POC but the realm split makes each independently configurable. |
| **Sessions** | USE. SSO across `gov` portals via shared realm SSO session. Short access tokens; refresh rotation. |
| **Service accounts** | USE where a backend job needs to call another service without a user (e.g. a delegation-expiry sweeper calling the API). |
| **Authorization Services / fine-grained permissions (UMA)** | EVALUATE — **not** used as the primary mechanism. See Part I. |
| **Audit / admin events** | USE for *authentication* audit (logins, admin changes). Business audit lives in the app DB (see [04](04-delegation-and-database-model.md)). |

## Part I — Keycloak Authorization Services: evaluated, and why the app owns fine-grained authz

Keycloak Authorization Services (resources, scopes, policies, permissions, RPT/UMA) *can* express policies including time-based ones. We **do not** make it the primary authorization engine because:

1. **Per-request business context.** Decisions depend on workflow state, assignment, and record ministry — data that lives in the app DB, not Keycloak. Pushing it into Keycloak means syncing business state into Keycloak or calling back to the app anyway.
2. **Delegation semantics.** "Act as another principal for a time window with an audit trail" is not natural in UMA policies and, worse, would still risk stale grants inside issued RPTs.
3. **Operability & clarity.** For a POC whose goal is to *demonstrate the boundary*, an explicit app-layer authorization module is far more legible than distributed Keycloak policy objects.

**Verdict:** Keycloak = authentication + coarse RBAC + identity context. Application = fine-grained, contextual, temporal authorization. (If a future need arises for cross-app fine-grained resource sharing, Authorization Services can be reconsidered for *that* slice.)

## Part J — Concept-by-concept suitability (brief §11)

| Concept | Use? | Rationale (short) |
|---------|------|-------------------|
| Realms | ✅ (2) | Separate citizens from gov; one gov realm for all ministries. |
| Clients | ✅ | One per portal + `backend-api` audience. |
| Realm roles | ✅ | Coarse cross-cutting business roles. |
| Client roles | ⚠️ sparingly | Only UI-only, single-client capabilities. |
| Groups / hierarchy | ✅ | **Ministry modelling** + admin scoping. |
| User attributes | ✅ | `home_ministry`, `position`, `user_type` context claims. |
| Organizations | ⚪ future | Substitute for group hierarchy if ministries federate IdPs. |
| Service accounts | ✅ | Backend/system jobs. |
| Scopes / client scopes | ✅ | Bundle context mappers; control audience. |
| Claims | ✅ | Thin identity claims only. |
| Protocol mappers | ✅ | Emit attributes + roles + audience. |
| Identity providers | ⚪ future | Broker gov directory / national-ID. |
| Authentication flows | ✅ | Distinct flows per realm; MFA in prod. |
| Authorization Services | ⚪ deferred | App owns fine-grained authz (Part I). |
| Fine-grained permissions | ✅ (app) | In the application layer, not Keycloak. |
| Token claims | ✅ thin | Identity + coarse roles only. |
| Session management | ✅ | SSO + short tokens + rotation. |
| Admin roles | ✅ fine-grained | Group-scoped ministry admins. |
| Audit events | ✅ auth only | Business audit in app DB. |

Continue to **[04 — Delegation & Database Model](04-delegation-and-database-model.md)**.
