import { keycloak } from "./keycloak";
import { config } from "./config";

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };
export type EmployeeRecord = Record<string, string | number | null>;

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

/** The signed-in person's EID, from the Resolver profile (cid claim). */
export async function getEid(cid: string): Promise<Result<string | null>> {
  const r = await get<{ ids: { eid: string | null } }>(`${config.resolverUrl}/v1/profile/${encodeURIComponent(cid)}`);
  return r.ok ? { ok: true, data: r.data.ids.eid } : r;
}

/** MPS registry, by EID. */
export function getEmployee(eid: string) {
  return get<{ records: EmployeeRecord[] }>(`${config.mpsApiUrl}/api/mps/employees/by-eid/${encodeURIComponent(eid)}`);
}
