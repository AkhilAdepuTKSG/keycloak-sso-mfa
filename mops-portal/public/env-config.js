// Dev default; overwritten at container start by docker-entrypoint from env.
window.__APP_CONFIG__ = {
  keycloakUrl: "http://localhost:8080",
  realm: "gov",
  clientId: "mps-portal",
  apiBaseUrl: "http://localhost:4000",
};
