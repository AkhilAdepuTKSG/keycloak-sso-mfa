import { config } from "./config";

// Thin client for the Keycloak Admin REST API, authenticated with the
// `provisioning-service` service account (client credentials). The human IT
// admin never gets these rights directly — the backend mediates and audits.

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
  if (!res.ok) throw new Error(`admin token failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return json.access_token;
}

async function kc(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAdminToken();
  const res = await fetch(`${config.internalUrl}/admin/realms/${config.realm}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function kcJson<T>(path: string): Promise<T> {
  const res = await kc(path);
  if (!res.ok) throw new Error(`KC GET ${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export interface KcUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

export async function listUsers(): Promise<KcUser[]> {
  return kcJson<KcUser[]>(`/users?max=200&briefRepresentation=true`);
}

export async function getUserGroups(id: string): Promise<{ id: string; path: string }[]> {
  return kcJson(`/users/${id}/groups`);
}

// Users holding a given realm role (Keycloak user id == token `sub`).
export async function getUsersByRole(role: string): Promise<KcUser[]> {
  return kcJson<KcUser[]>(`/roles/${role}/users?max=200`);
}

export async function getUserRealmRoles(id: string): Promise<{ name: string }[]> {
  return kcJson(`/users/${id}/role-mappings/realm`);
}

// Verify a claimed subject actually holds a realm role (defense in depth — never
// trust a role/eligibility asserted by the client body).
export async function userHasRealmRole(id: string, role: string): Promise<boolean> {
  try {
    const roles = await getUserRealmRoles(id);
    return roles.some((r) => r.name === role);
  } catch {
    return false;
  }
}

async function groupByPath(path: string): Promise<{ id: string }> {
  // path like "Agencies/MOH" or "Agencies/MOH/Originators"
  return kcJson(`/group-by-path/${path}`);
}

async function realmRole(name: string): Promise<{ id: string; name: string }> {
  return kcJson(`/roles/${name}`);
}

export interface CreateUserInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  agency: string;
  designateOriginator: boolean;
  roles: string[];
}

export async function createUser(input: CreateUserInput): Promise<string> {
  const createRes = await kc(`/users`, {
    method: "POST",
    body: JSON.stringify({
      username: input.username,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      enabled: true,
      emailVerified: true,
      credentials: [{ type: "password", value: input.password, temporary: true }],
    }),
  });
  if (createRes.status !== 201) {
    throw new Error(`create user failed: ${createRes.status} ${await createRes.text()}`);
  }
  const location = createRes.headers.get("location") ?? "";
  const userId = location.split("/").pop() as string;

  // Base agency group (grants EMPLOYEE), or the Originators sub-group (grants
  // EMPLOYEE + AGENCY_ORIGINATOR) when the user is a designated originator.
  const groupPath = input.designateOriginator
    ? `Agencies/${input.agency}/Originators`
    : `Agencies/${input.agency}`;
  const group = await groupByPath(groupPath);
  const joinRes = await kc(`/users/${userId}/groups/${group.id}`, { method: "PUT" });
  if (!joinRes.ok) throw new Error(`group join failed: ${joinRes.status}`);

  await assignRoles(userId, input.roles);
  return userId;
}

export async function assignRoles(userId: string, roleNames: string[]): Promise<void> {
  const reps = [];
  for (const name of roleNames) {
    if (!name) continue;
    reps.push(await realmRole(name));
  }
  if (reps.length === 0) return;
  const res = await kc(`/users/${userId}/role-mappings/realm`, {
    method: "POST",
    body: JSON.stringify(reps),
  });
  if (!res.ok) throw new Error(`assign roles failed: ${res.status} ${await res.text()}`);
}

export async function setOriginator(
  userId: string,
  agency: string,
  designate: boolean,
): Promise<void> {
  const group = await groupByPath(`Agencies/${agency}/Originators`);
  const res = await kc(`/users/${userId}/groups/${group.id}`, {
    method: designate ? "PUT" : "DELETE",
  });
  if (!res.ok) throw new Error(`originator toggle failed: ${res.status}`);
}
