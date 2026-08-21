import { config } from "./config";

// Grants service-enrolment roles (e.g. NIS_MEMBER) on the citizens realm, using
// the citizen-provisioning-service account. The citizen never self-assigns.

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAdminToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 10_000) return cachedToken.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.provisioningClientId,
    client_secret: config.provisioningClientSecret,
  });
  const res = await fetch(
    `${config.internalUrl}/realms/${config.realm}/protocol/openid-connect/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  if (!res.ok) throw new Error(`admin token failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return json.access_token;
}

async function kc(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAdminToken();
  return fetch(`${config.internalUrl}/admin/realms/${config.realm}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export async function assignRealmRole(userId: string, roleName: string): Promise<void> {
  const roleRes = await kc(`/roles/${roleName}`);
  if (!roleRes.ok) throw new Error(`role lookup failed: ${roleRes.status}`);
  const role = await roleRes.json();
  const res = await kc(`/users/${userId}/role-mappings/realm`, {
    method: "POST",
    body: JSON.stringify([role]),
  });
  if (!res.ok) throw new Error(`assign role failed: ${res.status}`);
}
