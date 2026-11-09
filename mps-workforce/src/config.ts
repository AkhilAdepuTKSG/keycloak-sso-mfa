// Runtime config injected via /env-config.js (window.__APP_CONFIG__).

export interface AppConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  resolverUrl: string;
  mpsApiUrl: string;
}

const raw = (window as unknown as { __APP_CONFIG__?: Partial<AppConfig> }).__APP_CONFIG__ ?? {};

export const config: AppConfig = {
  keycloakUrl: raw.keycloakUrl ?? "http://localhost:7080",
  realm: raw.realm ?? "citizen",
  clientId: raw.clientId ?? "mps-portal",
  resolverUrl: raw.resolverUrl ?? "http://localhost:7090",
  mpsApiUrl: raw.mpsApiUrl ?? "http://localhost:7102",
};
