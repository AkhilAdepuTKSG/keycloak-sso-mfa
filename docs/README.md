# Government-Wide IAM & Authorization — Architecture & Design

> **POC question:** Should the government run **one Keycloak realm** for all ministries, **one realm per ministry**, or a **hybrid**? And can Keycloak serve as the government-wide identity foundation while the application layer handles ministry-level and cross-ministry authorization?

This folder is **Phase 1–3** (Analyze → Architecture → Design). It is deliberately produced **before** any application code so the architecture can be reviewed and corrected first. Implementation (Phase 4–6) follows once this is approved.

## Read in this order

| # | Document | What it answers |
|---|----------|-----------------|
| 01 | [Analysis & Architecture Recommendation](01-analysis-and-architecture.md) | Phase 1 requirement analysis, risks, authorization boundaries. Phase 2 realm-strategy decision (Single vs Multiple vs Hybrid) **with a firm recommendation**. |
| 02 | [Identity & Authorization Model](02-identity-and-authorization-model.md) | Entity model, the 6 authorization layers, the Keycloak-vs-Application boundary, and JWT/claims design. |
| 03 | [Keycloak Configuration](03-keycloak-configuration.md) | Concrete realms, clients, realm/client roles, groups, attributes, scopes, protocol mappers, admin isolation. Evaluates every Keycloak concept the brief lists. |
| 04 | [Delegation & Database Model](04-delegation-and-database-model.md) | Temporary-delegation data model + live authorization mechanism, and the full application DB schema. |
| 05 | [Answers to the 24 Key Questions](05-answers-to-key-questions.md) | Direct answers to every question in §23 of the brief. |
| 06 | [Final Recommendation](06-final-recommendation.md) | The required `RECOMMENDATION` block. |
| 07 | [Citizen SSO & the Two Identity Domains](07-citizen-sso-and-identity-domains.md) | Government-wide citizen SSO, the citizen-vs-employee (dual-persona) analysis, citizen data isolation, single logout, and how all six acceptance criteria hold at once. |

## The one-paragraph answer

**Use a hybrid two-realm model, not one realm for everything and not one realm per ministry.** A `citizens` realm (external, self-registration, millions of low-trust users) is kept separate from a single `gov` realm that holds **all** government employees of **all** ministries. Ministries are modelled *inside* each realm as **clients** (citizen-service clients in `citizens`; internal portals in `gov`) plus a **group hierarchy + a `home_ministry` attribute** for employees — never as separate realms. This is the only option that makes **government-wide citizen SSO** (one citizen identity across every ministry service), **SSO across all internal portals**, and **cross-ministry workflows** (a Permanent Secretary of MOH originating a request inside MOPS) simple authorization/SSO problems instead of federation problems. **Ministry isolation, cross-ministry responsibilities, temporary delegation, and citizen data isolation are business/data decisions and live in the application authorization layer — not in Keycloak roles and not in the JWT.** Keycloak is the identity + authentication + SSO + coarse-role foundation; the application is the source of truth for fine-grained, contextual, and time-bound authority. See **[07](07-citizen-sso-and-identity-domains.md)** for citizen SSO and the dual citizen/employee persona.

## The boundary in one picture

```
            KEYCLOAK  (identity foundation)                 APPLICATION  (authorization layer)
   ┌───────────────────────────────────────┐     ┌───────────────────────────────────────────┐
   │ • Authentication (OIDC / SSO)          │     │ • Resource ownership & assignment           │
   │ • Who the user is (sub, email)         │     │ • Ministry data scoping                      │
   │ • Coarse business roles (realm roles)  │ JWT │ • Cross-ministry responsibilities            │
   │ • home_ministry, position (attributes) │ ──► │ • Workflow state machine                     │
   │ • Group membership                     │     │ • Temporary delegation (time-bound)          │
   │ • Sessions, token issuance, admin log  │     │ • Fine-grained, per-request authorization    │
   └───────────────────────────────────────┘     │ • Business audit trail                        │
        stable, coarse, changes rarely           └───────────────────────────────────────────┘
                                                       dynamic, contextual, changes constantly
```

If a requirement cannot be expressed as *"a stable fact about who this person is,"* it does **not** belong in Keycloak or the token — it belongs in the application. Responsibilities and delegations are the clearest examples.
