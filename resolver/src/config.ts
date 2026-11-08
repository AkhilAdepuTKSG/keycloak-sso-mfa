export const config = {
  port: Number(process.env.PORT ?? 8090),

  clickhouseUrl: process.env.CLICKHOUSE_URL ?? "http://clickhouse:8123",
  clickhouseUser: process.env.CLICKHOUSE_USER ?? "resolver",
  clickhousePassword: process.env.CLICKHOUSE_PASSWORD ?? "",
  clickhouseDb: process.env.CLICKHOUSE_DB ?? "citizen360",
  // Keep this short: a slow answer at login is worse than a quick "try again".
  clickhouseTimeoutMs: Number(process.env.CLICKHOUSE_TIMEOUT_MS ?? 2500),

  // Shared secret for service callers (Keycloak SPI, seed loader, registries, curl).
  serviceKey: process.env.RESOLVER_SERVICE_KEY ?? "",

  // Bearer tokens from portals (profile endpoint only).
  issuer: process.env.KEYCLOAK_ISSUER ?? "http://localhost:7080/realms/citizen",
  keycloakInternalUrl: process.env.KEYCLOAK_INTERNAL_URL ?? "http://keycloak:8080",
  realm: process.env.KEYCLOAK_REALM ?? "citizen",

  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:7200").split(",").map((s) => s.trim()),
};
