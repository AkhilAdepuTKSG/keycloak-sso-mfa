export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/appdb",
  // Issuer as seen by clients (browser). JWKS/admin are fetched over the internal network.
  issuer: process.env.KEYCLOAK_ISSUER ?? "http://localhost:8080/realms/gov",
  internalUrl: process.env.KEYCLOAK_INTERNAL_URL ?? "http://keycloak:8080",
  realm: process.env.KEYCLOAK_REALM ?? "gov",
  audience: process.env.KEYCLOAK_AUDIENCE ?? "backend-api",
  provisioningClientId: process.env.PROVISIONING_CLIENT_ID ?? "provisioning-service",
  provisioningClientSecret: process.env.PROVISIONING_CLIENT_SECRET ?? "",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3100").split(",").map((s) => s.trim()),
  // Only tokens issued to these clients (authorized party) are accepted.
  allowedAzp: (process.env.AZP_ALLOWED ?? "mps-portal").split(",").map((s) => s.trim()),
};

// Max delegation window (guardrail so "temporary" stays honest).
export const MAX_DELEGATION_DAYS = 14;

// Allow-lists for delegation (never free-form).
export const ALLOWED_DELEGATED_ROLES = ["PERMANENT_SECRETARY_APPROVER"];
export const ALLOWED_DELEGATION_SCOPES = ["EMPLOYMENT_APPROVAL"];

export const PROCESSOR_ROLES = [
  "PERMANENT_SECRETARY",
  "CPO",
  "HR_OFFICER",
  "MINISTER",
  "CONFIDENTIAL_SECRETARY",
  "IT_ADMIN",
];
