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
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
};
