// DEV DEFAULT ONLY. In Docker this file is overwritten at container start by
// docker-entrypoint.d/40-env-config.sh (values come from docker-compose.yml).
window.__APP_CONFIG__ = {
  keycloakUrl: "http://localhost:7080",
  realm: "citizen",
  clientId: "my-guyana",
  kind: "myguyana",
  title: "My Guyana (dev)",
  subtitle: "Citizen 360 · every registry",
  resolverUrl: "http://localhost:7090",
  registryUrls: {
    nis: "http://localhost:7101",
    mps: "http://localhost:7102",
    gro: "http://localhost:7103",
    passport: "http://localhost:7104"
  },
  links: []
};
