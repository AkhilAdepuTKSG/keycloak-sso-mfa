// Reads the runtime config injected via /env-config.js (window.__APP_CONFIG__).
// Falls back to sensible dev defaults so `npm run dev` works without Docker.

export interface PortalLink {
  title: string;
  url: string;
}

export type PortalTheme = "orange" | "teal" | "green" | "blue" | "indigo" | "violet";

export interface AppConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  portalTitle: string;
  portalKind: "hub" | "service";
  theme: PortalTheme;
  links: PortalLink[];
}

const raw = (window as unknown as { __APP_CONFIG__?: Partial<AppConfig> }).__APP_CONFIG__ ?? {};

export const appConfig: AppConfig = {
  keycloakUrl: raw.keycloakUrl ?? "http://localhost:8080",
  realm: raw.realm ?? "citizens",
  clientId: raw.clientId ?? "citizen-portal",
  portalTitle: raw.portalTitle ?? "Citizen Portal",
  portalKind: (raw.portalKind as AppConfig["portalKind"]) ?? "hub",
  theme: (raw.theme as PortalTheme) ?? "orange",
  // Navigation links are only meaningful on the hub; service portals ignore them.
  links: raw.links ?? [],
};
