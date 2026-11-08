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
- Four **registry services** (NIS, MPS, GRO, Passport), each with its own database, a GET API and a
  frontend. **My Guyana** shows a 360 view across all four.
- **SSO**: sign in once, then open the other portals without signing in again. **MPS Workforce**
  needs assurance level *High* and triggers an **EID step-up** instead of a full login.

Everything is synthetic. All people are fictional.

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
To start again from scratch (wipes Keycloak, ClickHouse and registry data):

```bash
docker compose down -v
```

## Ports

All ports are bound to `127.0.0.1`.

| Port | Service | Notes |
|---|---|---|
| 7200 | **My Guyana** portal | accepts any ID · 360 view across all registries |
| 7201 | **NIS** portal | accepts the NIS number only |
| 7202 | **MPS Workforce** portal | accepts the EID only · needs High assurance |
| 7203 | **GRO** portal | accepts any ID (see note below) |
| 7204 | **Passport** portal | accepts the passport number only |
| 7080 | Keycloak | realm `citizen`; admin console `http://localhost:7080/admin` (admin / `change-me-admin`) |
| 7090 | Resolver API | `X-Service-Key: poc-resolver-service-key` |
| 7123 | ClickHouse HTTP | admin / `change-me-clickhouse-admin` |
| 7101 | NIS registry API | `X-Api-Key: poc-registry-api-key` |
| 7102 | MPS registry API | 〃 |
| 7103 | GRO registry API | 〃 |
| 7104 | Passport registry API | 〃 |

Keycloak's PostgreSQL and the registry PostgreSQL are not published.

## Test users

**Test password for every account: `Citizen360-Demo!`** (also in [seed/src/people.ts](seed/src/people.ts)).
Synthetic data only; don't reuse it anywhere real.

The CIDs are deterministic (UUIDv5 of the national ID), so they are the same on every machine.

| Person | National ID | NIS | Passport | DL | EID | GRO birth no. | Why they're here | CID (= Keycloak username) |
|---|---|---|---|---|---|---|---|---|
| Marisol Thornbury | 100000001 | 4000001 | R1000001 | DL100001 | EID10000001 | B1984000101 | **all IDs**, works in MPS | `a4b7a10b-5236-573d-8d56-d4ec1212d58b` |
| Devan Rampersaud | 100000002 | 4000002 | R1000002 | DL100002 | — | B1991000202 | **no EID**: MPS shows the enrol page | `1d696e25-640b-5d77-add0-dc0a46c1f3dc` |
| Celestine Abernathy | 100000003 | 4000003 | R1000033 (old R1000003 **superseded**) | — | — | B1978000303 | **renewed passport** | `e5fedb96-0283-5fe9-83ff-b1c369e117c6` |
| Joel Fairweather | 100000004 | 4000004 | R1000004 | — | EID10000004 | B1980000404 | **shares a family email** (`fairweather.family@example.org`) | `8146f8f2-e152-520a-a151-767efd96ed9c` |
| Nadia Fairweather | 100000005 | 4000005 | — | DL100005 | — | B1982000505 (born *Holloway*) | **shares a family email** | `82aa4300-ba14-5b01-9c67-7249ff0c2097` |
| Rohan Castellano | 100000006 | **4000099** | R1000006 | — | — | B1975000606 | **conflict**: NIS 4000099 has two active owners | `14f292b7-5d50-5008-9103-fa54580e64c6` |
| Tamsin Ogilvie | 100000007 | **4000099** | — | — | — | B1993000707 | the other owner of NIS 4000099 | `60415d33-93a8-52c3-8963-da1171cd15e1` |
| Ezekiel Marchetti | 100000008 | 4000008 | R1000008 | — | — | B1969000808 | in Citizen 360 but **no account claimed** | `b7f457ba-cbc4-5e5b-8726-6a2c3ba2f7bd` |

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

### Which IDs each portal accepts

Set per Keycloak client in the attributes `citizen.login.id_types` and `citizen.login.id_label`
([keycloak/realms/citizen-realm.json](keycloak/realms/citizen-realm.json)). The form shows only
those types. Any other ID type is rejected with a message that names the type that was typed.

| Portal (client) | Accepts | Required assurance (`default.acr.values`) |
|---|---|---|
| My Guyana (`my-guyana`) | NIS, national ID, passport, driver's licence, EID | verified |
| NIS (`nis-portal`) | NIS number | verified |
| MPS Workforce (`mps-portal`) | EID | **high** (also `minimum.acr.value`) |
| GRO (`gro-portal`) | NIS, national ID, passport, driver's licence, EID, GRO birth no. | verified |
| Passport (`passport-portal`) | passport number | verified |

> **GRO accepts any ID.** Citizens rarely know their GRO birth registration number, so the GRO
> portal accepts every government ID (and the GRO number too, for those who have it). The record
> it shows is still found through the person's CID.

## Demo script

Use one browser window (one SSO session). Use a private window to start clean.

1. **NIS number on the NIS portal.** Open <http://localhost:7201>. The form says *Accepted here:
   NIS number*. Sign in with `4000001` and the test password. You see Marisol's NIS record,
   *Signed in with: NIS number*, assurance *verified*.
2. **SSO to My Guyana.** Open <http://localhost:7200>. There's no login prompt. The 360 view lists
   all of Marisol's IDs from Citizen 360 and her NIS, MPS, GRO and Passport records.
3. **MPS needs High.** Open <http://localhost:7202>. Keycloak doesn't show the full login. It shows
   **Confirm with your EID** (step-up). Enter `EID10000001` and the test password (it stands in for
   the EID PIN). MPS opens with assurance *high* and shows the MPS employee record.
   *Then:* sign out (button at the bottom), sign in at My Guyana with `EID10000001`, and open MPS:
   it goes **straight in**, because the session was established with the EID.
4. **No EID → enrol page.** Sign out. Sign in at the NIS portal as Devan (`4000002`), then open
   MPS. You get **Link or enrol your EID**, not an error. *Back to the portal* returns to MPS with
   "Sign-in not completed".
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
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7102/api/mps/employees/by-eid/EID10000001
   ```
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7103/api/gro/births/by-registration-number/B1982000505
   ```
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7104/api/passport/passports/by-passport-number/R1000003
   ```
   ```bash
   curl -H "X-Api-Key: poc-registry-api-key" http://localhost:7104/api/passport/passports/4
   ```

More things to try:

- Passport portal with Celestine's old passport `R1000003`: refused (superseded, same message as a
  wrong password). With `R1000033` it works and lists both passports.
- My Guyana with driver's licence `DL100005` (Nadia): her 360 view shows the shared family email
  as a contact and her GRO birth surname *Holloway*.
- Resolver directly:
  ```bash
  curl -H "X-Service-Key: poc-resolver-service-key" "http://localhost:7090/v1/resolve?type=NIS&value=4000099"
  ```
  ```bash
  curl -H "X-Service-Key: poc-resolver-service-key" http://localhost:7090/v1/profile/a4b7a10b-5236-573d-8d56-d4ec1212d58b
  ```
  ```bash
  curl -H "X-Service-Key: poc-resolver-service-key" http://localhost:7090/v1/integrity
  ```
  `/v1/integrity` is the daily check: it lists NIS `4000099` with two owners.

## How it works

```
 Browser ──► portal SPA (7200-7204) ──OIDC──► Keycloak realm "citizen" (7080) ──► Keycloak PostgreSQL
                │                                │  citizen-identifier-first (SPI)
                │                                │  citizen-eid-step-up (SPI)
                │                                ▼
                │  GET /v1/profile/{cid}   Resolver API (7090) ──► ClickHouse "citizen360" (7123)
                ├──────────────────────────────►  resolve · profile · claim (write path)
                │
                └──► registry API (7101-7104) ──► registry PostgreSQL (one DB per registry)
                         └─ returns only records Citizen 360 links to the token's cid
```

### Login (identifier-first)

[CitizenIdentifierAuthenticator](keycloak/spi/src/main/java/gy/gov/citizen360/keycloak/CitizenIdentifierAuthenticator.java):

1. Shows one ID field and a password field. The label and accepted types come from the client attributes.
2. Normalises the ID (upper case, strips spaces and dashes) and detects its type from its format.
   A type the portal doesn't accept → clear rejection.
3. `POST /v1/resolve {type, value}` to the Resolver, which reads `identifier_lookup FINAL` and
   counts **active** owners: 0 → *not found*, 1 → CID, 2+ → *conflict* (refused, alert logged).
   Merged people are followed to the survivor; deceased → refused.
4. Not found, no claimed account, or wrong password all get the same message (with a dummy
   hash for timing). Brute-force detection counts against the CID account.
5. Resolver unreachable, timeout or 5xx → **"try again"**, never "not found".
6. On success it records the ID type in the session (`login_id_type` claim).

Tokens carry `sub`, `cid` (= username), `acr`, `login_id_type` and `person_loa`. Keycloak holds no
profile data. The user profile makes first name, last name and email optional, and **Verify
Profile** is disabled, so citizens are never prompted.

### Assurance levels and step-up

`acr.loa.map` = `basic:1, verified:2, high:3`. The browser flow `citizen-browser` is
*Cookie* OR (*Level 2 sub-flow*: identifier-first) + (*Level 3 sub-flow*: EID step-up), using
Keycloak's built-in **Condition – Level of Authentication**. MPS requests `high`, so a session that
reached level 2 runs only the level-3 sub-flow:

- session established **with the EID** → passes silently;
- person **has an EID** → "Confirm with your EID" (EID number + PIN; the POC uses the password as the PIN);
- **no EID** → "Link or enrol your EID" page.

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

1. extracts every record from the four registry APIs, plus a small GRA driver's-licence CSV;
2. links records into people by **cross-reference keys** (national ID and GRO birth number),
   union-find, no probabilistic matching;
3. writes persons and IDs **through the Resolver write path**. Tamsin's claim on NIS `4000099` is
   refused there and queued for a steward;
4. **simulates failure F1**: inserts that second owner straight into ClickHouse as the admin user,
   the way an unsynchronised legacy bulk load would. This is the deliberate conflict;
5. creates Keycloak users with **username = CID** and the test password.

### Registry APIs

One codebase ([registry-api](registry-api)), four containers (`REGISTRY=nis|mps|gro|passport`),
each with its own PostgreSQL database and table, seeded by its migrations:

| Registry | Table | By record ID | By registry number |
|---|---|---|---|
| NIS | `nis_member` | `GET /api/nis/members/:id` | `GET /api/nis/members/by-nis-number/:nis` |
| MPS | `mps_employee` | `GET /api/mps/employees/:id` | `GET /api/mps/employees/by-eid/:eid` |
| GRO | `gro_birth` | `GET /api/gro/births/:id` | `GET /api/gro/births/by-registration-number/:no` |
| Passport | `passport_record` | `GET /api/passport/passports/:id` | `GET /api/passport/passports/by-passport-number/:no` |

Callers authenticate in one of two ways:

- **`X-Api-Key`** (back office, the loader, curl): may read any record.
- **A citizen access token** from an allowed portal (`azp`). The registry asks the Resolver for
  the source records Citizen 360 links to that CID (`person_link`), and returns only those rows.
  Ownership is per record, not per number. The NIS registry holds two people's rows under
  `4000099`, and Rohan must not see Tamsin's.

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
| `keycloak/spi/` | identifier-first + EID step-up authenticators, login templates, messages |
| `resolver/` | Resolver API (Node/TypeScript, Express, `@clickhouse/client`) |
| `clickhouse/` | single-node schema + users (`init/`), production cluster DDL (`cluster/`) |
| `registry-api/` | the four registry GET APIs, with per-registry migrations and seed data |
| `registry-db/` | creates one database per registry |
| `portal/` | React SPA, one image run as the five portals |
| `seed/` | loader: link → Citizen 360 → Keycloak users; test passwords in `src/people.ts` |
| `docs/` | ClickHouse POC-to-cluster mapping |

## POC shortcuts (not production)

- **EID step-up uses the account password as the EID PIN.** Production: EID card + PIN, or
  brokering to an EID identity provider.
- **Per-ID lock is in-process** (one Resolver replica). Production: Redis or a Keeper ephemeral node.
- **Single ClickHouse node**, no quorum inserts, no `optimize_skip_unused_shards`. See
  [docs/clickhouse-layout.md](docs/clickhouse-layout.md) for what changes.
- **No account-claim flow.** Accounts are created by the seed. The design's claim (registry
  match + OTP to a registry-held contact) isn't built.
- **No MFA, no OTP gateway, no event bus** (merge/death events).
- **Plain HTTP, shared secrets in compose defaults.** Production: TLS, mTLS between Keycloak and
  the Resolver, secrets from a vault.
- **Linking is deterministic only** (national ID / GRO number). No Splink, no steward UI;
  refused claims are visible at `GET /v1/review`.
