# 05 — Answers to the 24 Key Questions (brief §23)

1. **Should we use one realm for the entire government?**
   Not for *everyone*. Use **one realm for all government *employees*** (`gov`) and a **separate realm for citizens** (`citizens`). One realm for employees is right because cross-ministry workflows and SSO demand a single issuer and no identity duplication. A separate citizen realm is right because citizens differ in scale, trust, and lifecycle.

2. **What are the disadvantages of separate realms per ministry?**
   Cross-ministry work requires identity brokering/federation for every action; tokens from one ministry aren't valid at another; SSO breaks; users with multi-ministry responsibilities get duplicated; audit fragments across realms; token validation must trust N issuers; and every client/role/flow/admin/backup is multiplied per ministry — untenable at 20–50 ministries. It also makes the flagship "MOH PS acts in MOPS" case a federation project instead of an authorization check.

3. **How should citizens and government employees coexist?**
   In **separate realms**. They never share a session; no workflow crosses them. The separation gives each its own registration, password policy, auth/MFA, IdPs, and breach boundary.

4. **How do we model ministry membership?**
   As a **group** (`/Ministries/<CODE>`) **plus a `home_ministry` user attribute** in the `gov` realm. The group gives structure and admin scoping; the attribute gives an easy token claim that drives ministry-based access control in the app.

5. **How do we support cross-ministry responsibilities?**
   With a coarse **`AGENCY_ORIGINATOR` realm role** (can this person originate cross-ministry at all?) **plus a `responsibilities` record in the app DB** that says *which* target ministry and on whose behalf. The role is in Keycloak; the scope is business data in the app.

6. **How do we prevent privilege escalation?**
   Default-deny + least privilege; ministry isolation by default; cross-ministry only via explicit responsibility records; **delegation is never a permanent role** but a scoped, time-bound record; delegation creation is guarded (only role-holders/ministry admins, allow-listed roles/scopes, capped duration, no re-delegation); admins are group-scoped, never realm-admin.

7. **Should ministries be represented using groups, organizations, attributes, roles, or a combination?**
   **Groups + attributes** (a combination), not roles (roles are capabilities, not org units) and not realms. Keycloak **Organizations** is a viable future substitute for the group hierarchy if ministries later bring their own federated IdPs.

8. **Which roles should be realm roles versus client roles?**
   Business/workflow capabilities (`EMPLOYEE`, `HR_OFFICER`, `CPO`, `PERMANENT_SECRETARY`, `AGENCY_ORIGINATOR`, `MINISTRY_ADMIN`) are **realm roles** — they're cross-client and enforced in `backend-api`. **Client roles** only for UI-only, single-client concerns (none needed in this POC).

9. **Where should business permissions live?**
   In the **application authorization layer** (code + DB), evaluated per request against workflow state, ownership, ministry, responsibilities, and delegations. Keycloak holds only coarse roles.

10. **How should temporary delegation work?**
    A `delegations` record (delegator, delegate, delegated_role, scope, ministry, start, end, reason, status, audit fields) that the app evaluates **live** on each request. If an active, in-window, scope/ministry-matching delegation exists, the delegate may act as the delegated role; the action is stamped with the effective role and delegation lineage.

11. **How can delegated permissions automatically expire?**
    Because the effective-authority check tests `now() BETWEEN starts_at AND ends_at` at **decision time**. Once past `ends_at`, the check yields nothing and authority vanishes — no token refresh and no removal job required (a sweeper only tidies status for reporting).

12. **How should delegation changes affect already-issued JWTs?**
    They **don't need to** — delegations are **never in the JWT**. The app reads them live, so a grant/revoke/expiry takes effect on the very next request regardless of the token. This is the core reason volatile authority stays out of the token.

13. **How do we audit delegated actions?**
    Every workflow transition and `audit_events` row records `effective_role`, `delegated` (bool), `delegated_by_sub`, and `delegation_id`, alongside actor, action, resource, ministry, result, time, IP/session — answering "who did this, as what role, delegated by whom, when, on what."

14. **How do we scale from 3 to 20–50+ ministries?**
    Add a **group subtree + a few roles** per ministry in the one `gov` realm — no new realm, client, or issuer. App ministry logic is data-driven off the `ministries` table and `home_ministry` claim, so new ministries need no code changes.

15. **How do we onboard a new ministry?**
    Insert a `ministries` row; create `/Ministries/<CODE>` group (with `ministry_code`) and default role mappings; create its portal client if it needs a dedicated UI (or reuse a generic internal portal); assign a group-scoped `MINISTRY_ADMIN`. No realm work.

16. **How do we onboard/offboard employees?**
    Onboard: provision in `gov` (directory/HR-driven), set `home_ministry`/`position`, add to the ministry group, grant roles. Offboard: disable the Keycloak user (kills sessions) and set responsibilities/delegations inactive; short token TTL means access ends quickly.

17. **How do we handle an employee moving ministries?**
    Re-parent the user to the new `/Ministries/<CODE>` group and update `home_ministry`; adjust roles. **One identity, one `sub`** — no duplication, and their audit history stays continuous. (In realm-per-ministry this is a cross-realm migration.)

18. **How do we handle a user with responsibilities across multiple ministries?**
    Multiple `responsibilities` rows (and/or delegations), each target-ministry-scoped. Their single identity operates in several ministries via app-layer grants — exactly the MOH-PS-in-MOPS case — with no change to home ministry.

19. **How do we handle multiple applications using the same identity?**
    All internal portals are clients in the `gov` realm sharing SSO; each requests the `backend-api` audience. One login, one identity, many apps.

20. **How do we maintain SSO across government portals?**
    Shared realm SSO session in `gov` + OIDC Auth Code/PKCE per portal; the browser's realm session provides silent SSO across `moh-portal`, `mops-portal`, `gov-admin-portal`.

21. **How do we prevent one ministry's administrators from managing another ministry's users?**
    **Group-scoped fine-grained admin**: `MINISTRY_ADMIN` gets `manage-users` limited to its `/Ministries/<CODE>` subgroup (or via the app's delegated-admin screen scoped to that group). No ministry admin holds `realm-admin`.

22. **What happens if Keycloak is unavailable?**
    Existing sessions continue: resource servers validate JWTs **offline** against cached JWKS, so in-flight requests with unexpired tokens still work. New logins and token refreshes fail until Keycloak returns. Mitigate with **HA/clustered Keycloak**, cached JWKS, and reasonable token lifetimes. The app's own authorization data (responsibilities, delegations) is in PostgreSQL and unaffected.

23. **How should token expiration and role changes be handled?**
    Short access tokens (~5 min) + rotating refresh tokens. Coarse **role changes** appear on next refresh (acceptable). **Delegation/responsibility changes** are instant because they're not in the token. High-value actions can additionally consult live app state (always) and, if needed, introspection.

24. **What should be handled by Keycloak versus the application authorization layer?**
    **Keycloak:** authentication/SSO, identity, credentials, sessions, coarse realm roles, group membership, `home_ministry`/`position`/`user_type` attributes, token issuance, auth/admin audit. **Application:** resource ownership/assignment, ministry data scoping, cross-ministry responsibilities, workflow state, temporary delegation (lifecycle + live evaluation), fine-grained per-request permissions, and the business audit trail.

Continue to **[06 — Final Recommendation](06-final-recommendation.md)**.
