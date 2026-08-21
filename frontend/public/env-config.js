// DEV DEFAULT ONLY. In Docker this file is overwritten at container start by
// docker-entrypoint (values come from the service's environment in
// docker-compose.yml). When running `npm run dev` locally, edit these values.
window.__APP_CONFIG__ = {
  keycloakUrl: "http://localhost:8080",
  realm: "citizens",
  clientId: "citizen-portal",
  portalTitle: "Citizen Portal (dev)",
  portalKind: "hub",
  theme: "orange",
  links: [
    { title: "MPS Services", url: "http://localhost:3001" },
    { title: "NIS Services", url: "http://localhost:3002" },
    { title: "GPL Services", url: "http://localhost:3003" }
  ]
};
