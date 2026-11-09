import { REGISTRIES, RegistryKey } from "./registries";

const key = (process.env.REGISTRY ?? "nis").toLowerCase() as RegistryKey;
if (!REGISTRIES[key]) {
  throw new Error(`REGISTRY must be one of ${Object.keys(REGISTRIES).join(", ")}`);
}

export const config = {
  registry: REGISTRIES[key],
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: process.env.DATABASE_URL ?? `postgres://postgres:postgres@localhost:5432/${key}_registry`,

  // Back-office / batch callers (seed loader, curl) send X-Api-Key.
  apiKey: process.env.REGISTRY_API_KEY ?? "",

  // Portals send the citizen's access token from the `citizen` realm.
  issuer: process.env.KEYCLOAK_ISSUER ?? "http://localhost:7080/realms/citizen",
  internalUrl: process.env.KEYCLOAK_INTERNAL_URL ?? "http://keycloak:8080",
  realm: process.env.KEYCLOAK_REALM ?? "citizen",
  // Which portals (token azp) may call this registry.
  allowedAzp: (process.env.AZP_ALLOWED ?? "my-guyana").split(",").map((s) => s.trim()),

  // Ownership check: is this record's number one of the signed-in person's IDs?
  resolverUrl: process.env.RESOLVER_URL ?? "http://resolver:8090",
  resolverKey: process.env.RESOLVER_SERVICE_KEY ?? "",

  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:7200").split(",").map((s) => s.trim()),
};
