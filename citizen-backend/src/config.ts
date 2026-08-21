export const config = {
  port: Number(process.env.PORT ?? 4100),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/appdb",
  issuer: process.env.KEYCLOAK_ISSUER ?? "http://localhost:8080/realms/citizens",
  internalUrl: process.env.KEYCLOAK_INTERNAL_URL ?? "http://keycloak:8080",
  realm: process.env.KEYCLOAK_REALM ?? "citizens",
  audience: process.env.KEYCLOAK_AUDIENCE ?? "citizen-api",
  provisioningClientId: process.env.PROVISIONING_CLIENT_ID ?? "citizen-provisioning-service",
  provisioningClientSecret: process.env.PROVISIONING_CLIENT_SECRET ?? "",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3002").split(",").map((s) => s.trim()),
  allowedAzp: (process.env.AZP_ALLOWED ?? "nis-portal").split(",").map((s) => s.trim()),
};
