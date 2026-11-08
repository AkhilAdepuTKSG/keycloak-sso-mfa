// The four registries. One codebase, four containers: each runs with REGISTRY=<key>
// against its own PostgreSQL database and serves only its own table.

export type RegistryKey = "nis" | "mps" | "gro" | "passport";

export interface RegistryDef {
  key: RegistryKey;
  name: string;
  /** The registry's table in its own database. */
  table: string;
  /** URL segment: /api/<key>/<resource>/... */
  resource: string;
  /** Column holding the registry's own ID number. */
  numberColumn: string;
  /** URL segment for lookups by that number: /api/<key>/<resource>/<numberRoute>/:number */
  numberRoute: string;
  /** Citizen 360 id_type of that number, used for the ownership check. */
  idType: string;
}

export const REGISTRIES: Record<RegistryKey, RegistryDef> = {
  nis: {
    key: "nis",
    name: "National Insurance Scheme",
    table: "nis_member",
    resource: "members",
    numberColumn: "nis_number",
    numberRoute: "by-nis-number",
    idType: "NIS",
  },
  mps: {
    key: "mps",
    name: "Ministry of Public Service (EID)",
    table: "mps_employee",
    resource: "employees",
    numberColumn: "eid",
    numberRoute: "by-eid",
    idType: "EID",
  },
  gro: {
    key: "gro",
    name: "General Register Office (births)",
    table: "gro_birth",
    resource: "births",
    numberColumn: "registration_no",
    numberRoute: "by-registration-number",
    idType: "GRO_BIRTH",
  },
  passport: {
    key: "passport",
    name: "Passport Office",
    table: "passport_record",
    resource: "passports",
    numberColumn: "passport_number",
    numberRoute: "by-passport-number",
    idType: "PASSPORT",
  },
};

/** Same normalisation as the Resolver: upper case, no spaces, dashes, dots or slashes. */
export function normaliseNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s\-./]/g, "");
}
