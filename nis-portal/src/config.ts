interface AppConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  apiBaseUrl: string;
}
const raw = (window as unknown as { __APP_CONFIG__?: Partial<AppConfig> }).__APP_CONFIG__ ?? {};
export const appConfig: AppConfig = {
  keycloakUrl: raw.keycloakUrl ?? "http://localhost:8080",
  realm: raw.realm ?? "citizens",
  clientId: raw.clientId ?? "nis-portal",
  apiBaseUrl: raw.apiBaseUrl ?? "http://localhost:4100",
};
