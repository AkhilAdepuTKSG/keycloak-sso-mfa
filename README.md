# Citizen 360 SSO — local POC

A runnable proof of concept of the **Citizen 360 identity architecture** for Guyana
(design doc: <https://claude.ai/artifact/DJhaDYgQE23H9wVoJ6Zono>, sections 4–6).

- One Keycloak realm, `citizen`. Every person has a **Citizen ID (CID)**, a UUID, and the CID is the
  Keycloak username. Keycloak holds login data only: username, password, enabled flag. It has no
  names, dates of birth or government IDs.
- A custom **identifier-first authenticator** (Keycloak SPI, Java) lets the citizen type the ID the
  portal accepts. It calls the **Resolver API**, `resolve(type, value) → CID`, then checks the
  password of the user whose username is that CID.
- **Citizen 360** lives in **ClickHouse**: insert-only tables with a version column. The Resolver
  is the only write path: it locks the ID, checks for existing owners, then inserts.
- **Citizen-facing services**, each with its own database, GET API and portal: **NIS**, **GRO**,
  **Passport** and **MPS Scholarships**. **My Guyana** is the citizen hub and shows a 360 view
  across these four.
- **MPS Workforce** is the Ministry of Public Service staff portal. It is **not part of My Guyana**:
  it has its own frontend and registry, and My Guyana neither links to it nor reads its data. It
  shares the realm, so SSO works, but it needs assurance level *High* and triggers an **EID
  step-up** instead of a full login.
- Assurance levels **Basic / Verified / High**. MPS Scholarships accepts an email address (Basic) as
  well as any government ID. Opening a Verified portal from an email-only session asks the person
  to **confirm with a government ID**.

Everything is synthetic. All people and institutions are fictional.

## Run it

```bash
docker compose up -d --build
```

The first build takes a few minutes. The one-shot `seed` job then links the registries into
Citizen 360 and creates the Keycloak users. Follow it until it prints `Seed complete.`:

```bash
docker compose logs -f seed
```

No `.env` is needed (compose has POC defaults). To change secrets, copy `.env.example` to `.env`.

The realm and registry databases are created only on first start. After pulling a change to
them, or to start again from scratch (this wipes Keycloak, ClickHouse and registry data), run:

```bash
docker compose down -v
```

## Ports

All ports are bound to `127.0.0.1`.

| Port | Service | Notes |
|---|---|---|
| **Citizen-facing** | | |
| 7200 | **My Guyana** | citizen hub · any government ID · 360 view of NIS, GRO, Passport, Scholarships |
| 7201 | **NIS** portal | NIS number only |
| 7203 | **GRO** portal | any government ID (see note below) |
| 7204 | **Passport** portal | passport number only |
| 7205 | **MPS Scholarships** portal | email (Basic) or any government ID |
| 7101 / 7103 / 7104 / 7105 | NIS / GRO / Passport / Scholarships registry APIs | `X-Api-Key: poc-registry-api-key` |
| **Public-service staff (not part of My Guyana)** | | |
| 7202 | **MPS Workforce** | EID only · needs High assurance |
| 7102 | MPS registry API | 〃 (citizen tokens: `mps-portal` only) |
| **Platform** | | |
| 7080 | Keycloak | realm `citizen`; admin console `http://localhost:7080/admin` (admin / `change-me-admin`) |
| 7090 | Resolver API | `X-Service-Key: poc-resolver-service-key` |
| 7123 | ClickHouse HTTP | admin / `change-me-clickhouse-admin` |

Keycloak's PostgreSQL and the registry PostgreSQL are not published.

## Test users

**Test password for every account: `Citizen360-Demo!`** (also in [seed/src/people.ts](seed/src/people.ts)).
Synthetic data only; don't reuse it anywhere real.

The CIDs are deterministic (UUIDv5 of the national ID, or of the email for a self-registered
applicant), so they are the same on every machine.

| Person | National ID | NIS | Passport | DL | EID | Email | Why they're here | CID (= Keycloak username) |
|---|---|---|---|---|---|---|---|---|
| Marisol Thornbury | 100000001 | 4000001 | R1000001 | DL100001 | EID10000001 | — | **all IDs**; MPS staff member | `a4b7a10b-5236-573d-8d56-d4ec1212d58b` |
| Devan Rampersaud | 100000002 | 4000002 | R1000002 | DL100002 | — | devan.rampersaud@example.org | **no EID** (MPS enrol page); scholarship **awarded** | `1d696e25-640b-5d77-add0-dc0a46c1f3dc` |
| Celestine Abernathy | 100000003 | 4000003 | R1000033 (old R1000003 **superseded**) | — | — | — | **renewed passport** | `e5fedb96-0283-5fe9-83ff-b1c369e117c6` |
| Joel Fairweather | 100000004 | 4000004 | R1000004 | — | EID10000004 | fairweather.family@example.org | **shares a family email** | `8146f8f2-e152-520a-a151-767efd96ed9c` |
| Nadia Fairweather | 100000005 | 4000005 | — | DL100005 | — | fairweather.family@example.org | **shares a family email**; scholarship under review; born *Holloway* | `82aa4300-ba14-5b01-9c67-7249ff0c2097` |
| Rohan Castellano | 100000006 | **4000099** | R1000006 | — | — | — | **conflict**: NIS 4000099 has two active owners | `14f292b7-5d50-5008-9103-fa54580e64c6` |
| Tamsin Ogilvie | 100000007 | **4000099** | — | — | — | tamsin.ogilvie@example.org | the other owner of NIS 4000099; scholarship awarded | `60415d33-93a8-52c3-8963-da1171cd15e1` |
| Kezia Brathwaite | — | — | — | — | — | kezia.brathwaite@example.org | **self-registered** for Scholarships with email only: provisional, **Basic** | `353175c8-089a-5254-ad21-9325243d7ba3` |
| Ezekiel Marchetti | 100000008 | 4000008 | R1000008 | — | — | — | in Citizen 360 but **no account claimed** | `b7f457ba-cbc4-5e5b-8726-6a2c3ba2f7bd` |

GRO birth registration numbers: Marisol `B1984000101`, Devan `B1991000202`, Celestine
`B1978000303`, Joel `B1980000404`, Nadia `B1982000505`, Rohan `B1975000606`, Tamsin `B1993000707`,
Ezekiel `B1969000808`. Kezia has none.

ID formats in this POC are synthetic and deliberately distinct, so the login form can tell what
kind of ID was typed:

| ID type | Format | Example |
|---|---|---|
| NIS number | 7 digits | `4000001` |
| National ID | 9 digits | `100000001` |
| Passport | `R` + 7 digits | `R1000001` |
| Driver's licence | `DL` + 6 digits | `DL100001` |
| EID | `EID` + 8 digits | `EID10000001` (dashes and spaces are fine: `EID-1000-0001`) |
| GRO birth registration | `B` + year + 6 digits | `B1984000101` |
| Email (Scholarships only, Basic) | `name@domain` | `kezia.brathwaite@example.org` |

### Which IDs each portal accepts

Set per Keycloak client in the attributes `citizen.login.id_types` and `citizen.login.id_label`
([keycloak/realms/citizen-realm.json](keycloak/realms/citizen-realm.json)). The form shows only
those types. Any other ID type is rejected with a message that names the type that was typed.

| Portal (client) | Accepts | Required assurance (`default.acr.values`) |
|---|---|---|
| My Guyana (`my-guyana`) | NIS, national ID, passport, driver's licence, EID | verified |
| NIS (`nis-portal`) | NIS number | verified |
| GRO (`gro-portal`) | NIS, national ID, passport, driver's licence, EID, GRO birth no. | verified |
| Passport (`passport-portal`) | passport number | verified |
| MPS Scholarships (`mps-scholarships`) | email, NIS, national ID, passport, driver's licence, EID | **basic** |
| MPS Workforce (`mps-portal`), staff | EID | **high** (also `minimum.acr.value`) |

> **GRO accepts any ID.** Citizens rarely know their GRO birth registration number, so the GRO
> portal accepts every government ID (and the GRO number too, for those who have it). The record
> it shows is still found through the person's CID.

> **Email gives Basic only.** An email address is a contact, not proof of identity, and a
> family can share one. Scholarships accepts it at Basic. A shared email is refused with
> *"…shared by more than one person… use your NIS number, national ID, passport or driver's
> licence instead"*. Opening a Verified portal (My Guyana, NIS, GRO, Passport) from an
> email-only session asks the person to **confirm with a government ID**, and only their own ID works.

## Demo script

Use one browser window (one SSO session). Use a private window to start clean. Sign out with the
button at the bottom of any portal.

1. **NIS number on the NIS portal.** Open <http://localhost:7201>. The form says *Accepted here:
   NIS number*. Sign in with `4000001` and the test password. You see Marisol's NIS record,
   *Signed in with: NIS number*, assurance *verified*.
2. **SSO to My Guyana.** Open <http://localhost:7200>. There's no login prompt. The 360 view lists
   all of Marisol's IDs from Citizen 360 and her **NIS, GRO, Passport and Scholarships** records.
   There's no MPS Workforce data and no link to it, even though Marisol is MPS staff.
3. **MPS Workforce needs High.** Open <http://localhost:7202> directly; it isn't linked from My
   Guyana. Keycloak shows **Confirm with your EID** (step-up), not the full login. Enter
   `EID10000001` and the test password (it stands in for the EID PIN). MPS Workforce opens with
   assurance *high* and the MPS employee record.
   *Then:* sign out, sign in at My Guyana with `EID10000001`, and open MPS Workforce. It goes
   **straight in**, because the session was established with the EID.
4. **No EID → enrol page.** Sign out. Sign in at the NIS portal as Devan (`4000002`), then open
   MPS Workforce. You get **Link or enrol your EID**, not an error. *Back to the portal* returns to
   MPS Workforce with "Sign-in not completed".
5. **Wrong ID type.** Sign out. On the NIS portal, type passport `R1000001`. You get *"NIS Portal
   accepts only your NIS number. The number you entered looks like a passport number."*
6. **Conflicting ID.** On the NIS portal, sign in with `4000099`. Login is refused: *"…our records
   link it to more than one person. A registry officer has been alerted."* Rohan can still sign in
   at My Guyana with his national ID `100000006`.
7. **ClickHouse outage.**
   ```bash
   docker compose stop clickhouse
   ```
   Keycloak stays up and healthy (`docker compose ps`). Try to sign in anywhere: *"We couldn't
   check your ID just now. Please try again in a minute."* Then:
   ```bash
   docker compose start clickhouse
   ```
   Wait about 5 s and submit again: login works. (Existing SSO sessions keep working
   throughout. Only the portals' data calls show "Citizen 360 is unavailable".)
8. **Registry GET APIs with curl** (back-office key):
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7101/api/nis/members/1
   ```
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7101/api/nis/members/by-nis-number/4000001
   ```
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7103/api/gro/births/by-registration-number/B1982000505
   ```
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7104/api/passport/passports/by-passport-number/R1000003
   ```
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7105/api/scholarships/applications/1
   ```
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7105/api/scholarships/applications/by-application-number/SCH2026000140
   ```
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7102/api/mps/employees/by-eid/EID10000001
   ```
9. **Scholarships with email (Basic).** Sign out. Open <http://localhost:7205> and sign in as
   Kezia with `kezia.brathwaite@example.org`. You get assurance *basic* and her submitted
   application. Open My Guyana: **Confirm with a government ID**. She has none, so she can't get
   in. Typing her email again gets *"…An email address only gives a basic sign-in"*.
10. **Basic → Verified step-up.** Sign out. On Scholarships, sign in as Devan with
    `devan.rampersaud@example.org` (*basic*, awarded scholarship). Open My Guyana. Confirm with
    `4000002`: you get *verified* and the 360 view. Someone else's ID (e.g. `4000001`) is refused
    with the generic message.
11. **Shared family email.** On Scholarships, try `fairweather.family@example.org`. It's refused
    with "shared by more than one person… use your NIS number…". Nadia can sign in with her
    national ID `100000005` and see her application under review. The Scholarships token says
    *basic*, because that's all the portal asks for. Because she used a government ID, opening My
    Guyana goes straight in at *verified*.

More things to try:

- Passport portal with Celestine's old passport `R1000003`: refused (superseded, same message as a
  wrong password). With `R1000033` it works and lists both passports.
- Resolver directly:
  ```bash
  curl -H "X-Service-Key: poc-resolver-service-key" "http://localhost:7090/v1/resolve?type=NIS&value=4000099"
  ```
  ```bash
  curl -H "X-Service-Key: poc-resolver-service-key" "http://localhost:7090/v1/resolve?type=EMAIL&value=fairweather.family@example.org"
  ```
  ```bash
  curl -H "X-Service-Key: poc-resolver-service-key" http://localhost:7090/v1/profile/a4b7a10b-5236-573d-8d56-d4ec1212d58b
  ```
  ```bash
  curl -H "X-Service-Key: poc-resolver-service-key" http://localhost:7090/v1/integrity
  ```
  `/v1/integrity` is the daily check: it lists NIS `4000099` with two owners. A shared family email
  is not a conflict: `resolve` answers `409` with `reason: "shared_contact"` and raises no alert.

## How it works

```
 Citizen portals (7200 My Guyana, 7201 NIS, 7203 GRO, 7204 Passport, 7205 Scholarships)
   │  one image, portal/
   ├──OIDC──► Keycloak realm "citizen" (7080) ──► Keycloak PostgreSQL
   │             SPI: citizen-identifier-first · citizen-verified-step-up · citizen-eid-step-up
   │             │ resolve(type, value)
   │             ▼
   ├──────────► Resolver API (7090) ──► ClickHouse "citizen360" (7123)
   │  GET /v1/profile/{cid}
   └──────────► NIS / GRO / Passport / Scholarships APIs (7101, 7103-7105) ──► registry PostgreSQL

 MPS Workforce (7202, mps-workforce/) ──OIDC (acr high)──► same realm
   └──────────► MPS API (7102), accepts only mps-portal tokens

 Registry APIs return only records Citizen 360 links to the token's cid.
```

### Login (identifier-first)

[CitizenIdentifierAuthenticator](keycloak/spi/src/main/java/gy/gov/citizen360/keycloak/CitizenIdentifierAuthenticator.java):

1. Shows one ID field and a password field. The label and accepted types come from the client attributes.
2. Normalises the ID (upper case, strips spaces and dashes; emails lower case) and detects its
   type from its format. A type the portal doesn't accept → clear rejection.
3. `POST /v1/resolve {type, value}` to the Resolver, which reads `identifier_lookup FINAL` and
   counts **active** owners: 0 → *not found*, 1 → CID, 2+ → *conflict* (refused, alert logged), or
   *shared contact* for an email (refused with "use a government ID", no alert). Merged people are
   followed to the survivor; deceased → refused.
4. Not found, no claimed account, or wrong password all get the same message (with a dummy
   hash for timing). Brute-force detection counts against the CID account.
5. Resolver unreachable, timeout or 5xx → **"try again"**, never "not found".
6. On success it records the ID type in the session (`login_id_type` claim).

Tokens carry `sub`, `cid` (= username), `acr`, `login_id_type` and `person_loa`. Keycloak holds no
profile data. The user profile makes first name, last name and email optional, and **Verify
Profile** is disabled, so citizens are never prompted.

### Assurance levels and step-up

`acr.loa.map` = `basic:1, verified:2, high:3`. The browser flow `citizen-browser` is
*Cookie* OR one conditional sub-flow per level, using Keycloak's built-in **Condition – Level of
Authentication**:

| Level | Sub-flow step | What it does |
|---|---|---|
| 1 basic | `citizen-identifier-first` | the login form: any ID the portal accepts |
| 2 verified | `citizen-verified-step-up` | passes silently if the login used a government ID; after an email login, "Confirm with a government ID" (the person's own only) |
| 3 high | `citizen-eid-step-up` | passes silently if the session was established with the EID; else "Confirm with your EID" (EID + PIN; the POC uses the password as the PIN); no EID → "Link or enrol your EID" |

A fresh login runs only the levels the portal asks for, and shows only one form when that form
already satisfies the higher levels. A step-up runs only the missing levels.

### Citizen 360 on ClickHouse

Tables in [clickhouse/init/01-schema.sql](clickhouse/init/01-schema.sql): `identifier_lookup`
(`ReplacingMergeTree(version)`, `ORDER BY (id_type, id_value, cid)`), `person_identifier` (same
rows `ORDER BY (cid, id_type, id_value)`, fed by a materialized view), `person` (`ORDER BY cid`),
plus `person_link` and `match_review`. Single node; the mapping to the sharded
`_local` + Distributed layout (2 shards × 2 replicas + 3 Keeper) is in
[docs/clickhouse-layout.md](docs/clickhouse-layout.md) and
[clickhouse/cluster/citizen360-cluster.sql](clickhouse/cluster/citizen360-cluster.sql).

The profile endpoint returns one wide row using the design doc's `argMaxIf` pivot, plus the full
identifier list (including superseded IDs) and source links.

Write path (`POST /v1/identifiers`): per-ID lock (in-process) → read current owners → if someone
else actively owns a government ID, refuse (409) and queue a `match_review` row → else insert a
new version → re-check. Emails and phones may be shared and never conflict.

### Seed loader

[seed/src/index.ts](seed/src/index.ts) runs once per `docker compose up` (re-run with
`docker compose run --rm seed`):

1. extracts every record from the five registry APIs, plus a small GRA driver's-licence CSV;
2. links records into people by **cross-reference keys** (national ID and GRO birth number),
   union-find, no probabilistic matching. Email is never a linking key. A scholarship applicant
   with no government ID becomes a **provisional** person at **Basic**;
3. writes persons and IDs **through the Resolver write path**. Tamsin's claim on NIS `4000099` is
   refused there and queued for a steward;
4. **simulates failure F1**: inserts that second owner straight into ClickHouse as the admin user,
   the way an unsynchronised legacy bulk load would. This is the deliberate conflict;
5. creates Keycloak users with **username = CID** and the test password.

### Registry APIs

One codebase ([registry-api](registry-api)), one container per registry
(`REGISTRY=nis|gro|passport|scholarships|mps`), each with its own PostgreSQL database and table,
seeded by its migrations:

| Registry | Table | By record ID | By registry number | Citizen tokens from |
|---|---|---|---|---|
| NIS | `nis_member` | `GET /api/nis/members/:id` | `GET /api/nis/members/by-nis-number/:nis` | `nis-portal`, `my-guyana` |
| GRO | `gro_birth` | `GET /api/gro/births/:id` | `GET /api/gro/births/by-registration-number/:no` | `gro-portal`, `my-guyana` |
| Passport | `passport_record` | `GET /api/passport/passports/:id` | `GET /api/passport/passports/by-passport-number/:no` | `passport-portal`, `my-guyana` |
| Scholarships | `scholarship_application` | `GET /api/scholarships/applications/:id` | `GET /api/scholarships/applications/by-application-number/:no` | `mps-scholarships`, `my-guyana` |
| MPS (staff) | `mps_employee` | `GET /api/mps/employees/:id` | `GET /api/mps/employees/by-eid/:eid` | `mps-portal` only |

Callers authenticate in one of two ways:

- **`X-Api-Key`** (back office, the loader, curl): may read any record.
- **A citizen access token** from an allowed portal (`azp`). The registry asks the Resolver for
  the source records Citizen 360 links to that CID (`person_link`), and returns only those rows.
  Ownership is per record, not per number. The NIS registry holds two people's rows under
  `4000099`, and Rohan must not see Tamsin's. Scholarship applications aren't personal IDs, so the
  portals find them through those links.

### Keycloak and ClickHouse independence

Both run in the same compose project, and neither depends on the other:

- `keycloak` depends only on `keycloak-db`. It reaches Citizen 360 over HTTP at login time.
- `clickhouse` and `resolver` have no `depends_on`. The Resolver's `/health` doesn't touch
  ClickHouse; `/ready` does.
- Only the one-shot `seed` job waits for everything.

## Repository layout

| Path | What |
|---|---|
| `keycloak/` | Dockerfile (compiles the SPI against the Keycloak 26.2.5 jars, then `kc.sh build`), realm JSON |
| `keycloak/spi/` | identifier-first, verified step-up and EID step-up authenticators; login templates, messages |
| `resolver/` | Resolver API (Node/TypeScript, Express, `@clickhouse/client`) |
| `clickhouse/` | single-node schema + users (`init/`), production cluster DDL (`cluster/`) |
| `registry-api/` | the registry GET APIs, with per-registry migrations and seed data |
| `registry-db/` | creates one database per registry |
| `portal/` | citizen-facing React SPA, one image run as My Guyana, NIS, GRO, Passport and Scholarships |
| `mps-workforce/` | MPS Workforce staff SPA (separate from My Guyana) |
| `seed/` | loader: link → Citizen 360 → Keycloak users; test passwords in `src/people.ts` |
| `docs/` | ClickHouse POC-to-cluster mapping |

## POC shortcuts (not production)

- **EID step-up uses the account password as the EID PIN.** Production: EID card + PIN, or
  brokering to an EID identity provider.
- **MPS Workforce shares the citizen realm** (as in the design doc), so SSO and the EID step-up
  work. Keeping staff in a separate realm is a policy choice the POC doesn't make.
- **Per-ID lock is in-process** (one Resolver replica). Production: Redis or a Keeper ephemeral node.
- **Single ClickHouse node**, no quorum inserts, no `optimize_skip_unused_shards`. See
  [docs/clickhouse-layout.md](docs/clickhouse-layout.md) for what changes.
- **No account-claim or self-registration flow.** Accounts (including Kezia's email-only one) are
  created by the seed. The design's claim (registry match + OTP to a registry-held contact) isn't built.
- **No MFA, no OTP gateway, no event bus** (merge/death events).
- **Plain HTTP, shared secrets in compose defaults.** Production: TLS, mTLS between Keycloak and
  the Resolver, secrets from a vault.
- **Linking is deterministic only** (national ID / GRO number). No Splink, no steward UI;
  refused claims are visible at `GET /v1/review`.
