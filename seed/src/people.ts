// Test accounts for the Citizen 360 POC. All people are fictional.
//
// The registries hold the people (registry-api/src/migrations/*/002_seed.sql). This
// file only says which of them have claimed a Keycloak account, and with what
// password. Keycloak usernames are the CIDs the loader derives, never these IDs.
//
// TEST PASSWORD (all accounts): Citizen360-Demo!
// Synthetic data only; never reuse this password anywhere real.

export const DEMO_PASSWORD = "Citizen360-Demo!";

export interface Account {
  /** National ID that anchors the person in the registry data. */
  nationalId: string;
  password: string;
  /** Why this person is in the seed. */
  scenario: string;
}

export const ACCOUNTS: Account[] = [
  { nationalId: "100000001", password: DEMO_PASSWORD, scenario: "has every ID, including an EID (High assurance)" },
  { nationalId: "100000002", password: DEMO_PASSWORD, scenario: "no EID: MPS shows the link-or-enrol page" },
  { nationalId: "100000003", password: DEMO_PASSWORD, scenario: "passport renewed: old number superseded" },
  { nationalId: "100000004", password: DEMO_PASSWORD, scenario: "shares a family email; holds an EID" },
  { nationalId: "100000005", password: DEMO_PASSWORD, scenario: "shares a family email; no passport" },
  { nationalId: "100000006", password: DEMO_PASSWORD, scenario: "NIS 4000099 also linked to another person: NIS login refused" },
  { nationalId: "100000007", password: DEMO_PASSWORD, scenario: "the other owner of NIS 4000099" },
  // 100000008 (Ezekiel Marchetti) is in the registries and Citizen 360 but has not claimed an account.
];

/**
 * The deliberate conflict. The Resolver's write path refuses a second active owner,
 * so the loader inserts this one row straight into ClickHouse, the way an unsynchronised
 * legacy bulk load would (design doc, failure F1). The daily integrity check reports it
 * and the Resolver refuses logins with this NIS number.
 */
export const F1_CONFLICT = { idType: "NIS", idValue: "4000099", secondOwnerNationalId: "100000007" };
