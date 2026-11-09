import { keycloak } from "./keycloak";
import { appConfig, RegistryKey } from "./appConfig";

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function get<T>(url: string): Promise<Result<T>> {
  try {
    await keycloak.updateToken(30);
  } catch {
    keycloak.login();
  }
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${keycloak.token}` } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const message = r.status === 503
        ? "Citizen 360 is unavailable right now. Try again in a minute."
        : (body as { error?: string }).error ?? `HTTP ${r.status}`;
      return { ok: false, status: r.status, message };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, message: `Could not reach ${new URL(url).host}` };
  }
}

export interface Identifier {
  id_type: string;
  id_value: string;
  status: string;
  verified: string;
  source: string;
  updated_at: string;
}

export interface SourceLink {
  source_system: string;
  source_record_id: string;
  method: string;
  decided_by: string;
}

export interface Profile {
  cid: string;
  person: { status: string; loa: string; merged_into_cid: string | null };
  ids: {
    national_id: string | null;
    nis: string | null;
    passport: string | null;
    dl: string | null;
    eid: string | null;
    gro_birth: string | null;
    email: string | null;
  };
  identifiers: Identifier[];
  links: SourceLink[];
}

export type RegistryRecord = Record<string, string | number | null>;

export function getProfile(cid: string) {
  return get<Profile>(`${appConfig.resolverUrl}/v1/profile/${encodeURIComponent(cid)}`);
}

// Base path of each citizen-facing registry API.
const BASE: Record<RegistryKey, string> = {
  nis: "api/nis/members",
  gro: "api/gro/births",
  passport: "api/passport/passports",
  scholarships: "api/scholarships/applications",
};

const BY_NUMBER: Record<Exclude<RegistryKey, "scholarships">, string> = {
  nis: "by-nis-number",
  gro: "by-registration-number",
  passport: "by-passport-number",
};

/** GET by the registry's own ID number (NIS number, GRO registration no., passport no.). */
export function getRecordsByNumber(registry: Exclude<RegistryKey, "scholarships">, number: string) {
  return get<{ records: RegistryRecord[] }>(
    `${appConfig.registryUrls[registry]}/${BASE[registry]}/${BY_NUMBER[registry]}/${encodeURIComponent(number)}`,
  );
}

/** GET by record ID. */
export function getRecordById(registry: RegistryKey, id: string) {
  return get<{ record: RegistryRecord }>(`${appConfig.registryUrls[registry]}/${BASE[registry]}/${encodeURIComponent(id)}`);
}
