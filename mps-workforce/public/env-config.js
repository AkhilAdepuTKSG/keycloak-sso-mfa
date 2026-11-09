// DEV DEFAULT ONLY. In Docker this file is overwritten at container start by
// docker-entrypoint.d/40-env-config.sh (values come from docker-compose.yml).
window.__APP_CONFIG__ = {
  keycloakUrl: "http://localhost:7080",
  realm: "citizen",
  clientId: "mps-portal",
  resolverUrl: "http://localhost:7090",
  mpsApiUrl: "http://localhost:7102"
};
