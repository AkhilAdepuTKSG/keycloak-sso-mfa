import { keycloak } from "./keycloak";
import { appConfig } from "./config";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  await keycloak.updateToken(30).catch(() => keycloak.login());
  const res = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${keycloak.token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, b?: unknown) => request<T>(p, { method: "POST", body: JSON.stringify(b ?? {}) }),
};

// Force a fresh access token so a newly granted role (NIS_MEMBER) appears.
export async function refreshToken(): Promise<void> {
  await keycloak.updateToken(-1);
}
