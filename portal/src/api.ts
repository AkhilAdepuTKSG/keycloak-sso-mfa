import { keycloak } from "./keycloak";
import { appConfig } from "./appConfig";

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
  } catch (err) {
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
  links: { source_system: string; source_record_id: string; method: string; decided_by: string }[];
}

export type RegistryRecord = Record<string, string | number | null>;

export function getProfile(cid: string) {
  return get<Profile>(`${appConfig.resolverUrl}/v1/profile/${encodeURIComponent(cid)}`);
}

const ROUTES = {
  nis: "api/nis/members/by-nis-number",
  mps: "api/mps/employees/by-eid",
  gro: "api/gro/births/by-registration-number",
  passport: "api/passport/passports/by-passport-number",
} as const;

export type RegistryKey = keyof typeof ROUTES;

export function getRegistryRecords(registry: RegistryKey, number: string) {
  return get<{ records: RegistryRecord[] }>(
    `${appConfig.registryUrls[registry]}/${ROUTES[registry]}/${encodeURIComponent(number)}`,
  );
}
