// Runtime config injected via /env-config.js (window.__APP_CONFIG__), written per
// container by docker-entrypoint.d/40-env-config.sh. One image, five portals.

export type PortalKind = "myguyana" | "nis" | "mps" | "gro" | "passport";

export interface PortalLink {
  kind: PortalKind;
  title: string;
  url: string;
  note?: string;
}

export interface AppConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  kind: PortalKind;
  title: string;
  subtitle: string;
  resolverUrl: string;
  registryUrls: Record<"nis" | "mps" | "gro" | "passport", string>;
  links: PortalLink[];
}

const raw = (window as unknown as { __APP_CONFIG__?: Partial<AppConfig> }).__APP_CONFIG__ ?? {};

export const appConfig: AppConfig = {
  keycloakUrl: raw.keycloakUrl ?? "http://localhost:7080",
  realm: raw.realm ?? "citizen",
  clientId: raw.clientId ?? "my-guyana",
  kind: (raw.kind as PortalKind) ?? "myguyana",
  title: raw.title ?? "My Guyana",
  subtitle: raw.subtitle ?? "",
  resolverUrl: raw.resolverUrl ?? "http://localhost:7090",
  registryUrls: raw.registryUrls ?? {
    nis: "http://localhost:7101",
    mps: "http://localhost:7102",
    gro: "http://localhost:7103",
    passport: "http://localhost:7104",
  },
  links: raw.links ?? [],
};
