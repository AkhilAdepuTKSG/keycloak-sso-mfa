# 06 — Final Recommendation

```
RECOMMENDATION
===============

Realm Strategy:
    HYBRID — two realms = the two identity domains.
      • realm "citizens" : ONE government-wide citizen identity per person;
                           ministry citizen-services are CLIENTS in this realm
                           (citizen-portal, moh/mops/mof-citizen-services) →
                           gov-wide Citizen SSO, one login, single logout.
      • realm "gov"      : ALL government employees of ALL ministries (one realm)
    Ministries are modelled INSIDE each realm as CLIENTS (+ a group hierarchy and
    home_ministry attribute for employees) — NEVER as separate realms.

Why:
    Two independent forces point to the same answer. (1) EMPLOYEE side: authority
    crosses ministry lines (an MOH Permanent Secretary originates inside MOPS; a
    MOPS CPO acts as the MOPS PS during absence) and internal portals share SSO —
    a single "gov" realm turns those into ordinary authorization checks on one
    token, one identity per person, one clean audit trail. (2) CITIZEN side: a
    citizen needs ONE government-wide identity and SSO across every ministry
    service — a single "citizens" realm with ministry services as clients gives
    exactly that. Realm-per-ministry breaks BOTH: it makes cross-ministry
    employee work a federation project AND fragments the citizen into the
    forbidden citizen@moh / citizen@mops / citizen@mof, needing brokering for
    every hop. It also multiplies every client/role/flow/admin per ministry —
    untenable at 20–50 ministries. Citizens are split from employees because they
    differ by orders of magnitude in scale, trust, onboarding, and breach blast
    radius, and never share a session. A person who is BOTH a citizen and an
    employee is ONE human with TWO identities (one account per realm/context) —
    deliberate separation of duties, optionally correlated by national ID at the
    data layer; NOT a merged login. This is the only place a realm wall earns
    its cost.

Ministry Modeling:
    Keycloak group hierarchy  /Ministries/<CODE>  (with a ministry_code group
    attribute) + a home_ministry user attribute emitted as a token claim.
    Onboarding a ministry = add a group subtree + a few roles. No new realm.
    (Keycloak Organizations is a viable future substitute if ministries later
    bring their own federated IdPs.)

Role Modeling:
    Coarse business capabilities as REALM ROLES in gov:
      EMPLOYEE, HR_OFFICER, CPO, PERMANENT_SECRETARY, AGENCY_ORIGINATOR,
      MINISTRY_ADMIN   (CITIZEN in the citizens realm).
    Client roles only for UI-only, single-client concerns (none needed here).
    The delegated "PERMANENT_SECRETARY_APPROVER" is NOT a Keycloak role — it
    exists only inside a delegation record and is evaluated live.

Citizen SSO & Isolation:
    One citizen identity in the "citizens" realm; ministry citizen-services are
    clients sharing one realm SSO session → log in once, reach MOH/MOPS/MOF
    services with no re-login; RP-initiated + back-channel SINGLE LOGOUT. SSO ≠
    access: every citizen request is authorized by RESOURCE OWNERSHIP
    (owner_sub == token.sub) plus per-ministry service rules in the app — never
    on the CITIZEN role alone. Citizen A can never read Citizen B's data.

Cross-Ministry Authorization:
    Coarse AGENCY_ORIGINATOR realm role (may they originate cross-ministry at
    all?) + a "responsibilities" record in the app DB (which target ministry,
    on whose behalf). Keycloak holds the capability; the app holds the scope.

Delegation:
    Application-managed. A "delegations" table (delegator, delegate, role,
    scope, ministry, start, end, reason, status, audit) evaluated LIVE on every
    request. Auto-expires because the time window is checked at decision time;
    revocation is instant; every delegated action is stamped with the effective
    role + delegation lineage. NOT a Keycloak role, NOT a JWT claim.

Business Authorization:
    In the application authorization layer — resource ownership/assignment,
    ministry scoping, workflow state, responsibilities, delegation, fine-grained
    per-request permissions. Default-deny.

JWT Strategy:
    THIN token. Carries only stable identity + coarse roles + org context:
      sub, email, user_type, home_ministry, position, realm_access.roles,
      plus standard OIDC (iss, aud=backend-api, azp, exp, iat).
    Explicitly EXCLUDES responsibilities, delegations, fine-grained permissions,
    and workflow data — those are resolved live server-side so revocation/expiry
    is immediate and tokens can stay short-lived (~5 min).

Keycloak Responsibilities:
    • Authentication & SSO (OIDC, Auth Code + PKCE)
    • Identity, credentials, sessions, token issuance
    • Coarse realm roles (RBAC)
    • Group membership (ministry structure) + fine-grained group-scoped admin
    • home_ministry / position / user_type attributes → thin claims
    • Authentication & admin audit (logins, admin changes)

Application Responsibilities:
    • Validate JWT offline (JWKS): sig, iss, aud, exp, azp
    • Ministry-based access control (home_ministry vs resource.ministry)
    • Resource-based access control (ownership / assignment / workflow state)
    • Cross-ministry responsibilities (responsibilities table)
    • Temporary delegation lifecycle + live evaluation (delegations table)
    • Fine-grained per-request authorization decisions (default-deny)
    • Business audit trail (effective role + delegation lineage)

Major Risks:
    • Ministry isolation is now an APP responsibility, not a realm wall — a
      missing check leaks cross-ministry. Mitigate with a central authorize()
      module, default-deny, and tests for every persona/scenario.
    • Single gov realm = larger blast radius across ministries. Mitigate with
      group-scoped admin, least privilege, HA, and monitoring.
    • Stale authority if anyone later puts delegation/responsibility into the
      token. Guard: keep them out; short access tokens.
    • Keycloak as a single point of login failure. Mitigate: HA/cluster, cached
      JWKS for offline validation, sensible token lifetimes.
    • Delegation abuse. Mitigate: allow-listed roles/scopes, capped duration,
      creator must hold the role, no re-delegation, full audit.

Production Considerations:
    • Keycloak HA (clustered, external DB, cached JWKS), MFA for employees,
      brokered government-directory / national-ID IdPs.
    • Declarative user profile + automated provisioning/deprovisioning from HR.
    • Secrets management, TLS everywhere, rotate signing keys.
    • Delegation-expiry sweeper (reporting only), retention & tamper-evidence on
      audit_events, SIEM export.
    • Rate limiting on citizen self-registration; bot/abuse protection.
    • Re-evaluate Keycloak Organizations for per-ministry federated IdPs at scale.
    • Load/scale testing citizen realm (millions) independently of gov realm.
```

## Does Keycloak alone suffice? — the honest answer

**No — and it shouldn't try to.** Keycloak is an excellent *identity and authentication* foundation and a fine *coarse RBAC* engine, and in the hybrid model it serves the entire government well in that role. But three of this system's hardest requirements — **ministry data scoping**, **cross-ministry responsibilities**, and **temporary time-bound delegation** — are **business/data decisions** that depend on runtime state (workflow position, record ownership, active grants) changing far faster than any token's lifetime. Forcing them into Keycloak roles or JWT claims produces stale-authority security holes and operational rigidity. The correct architecture therefore uses **Keycloak for identity + authentication + coarse roles**, and a **dedicated application authorization layer** for everything contextual, fine-grained, and temporal. The POC is built specifically to demonstrate that boundary — not merely that login works.
