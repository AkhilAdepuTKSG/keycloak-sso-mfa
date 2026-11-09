#!/bin/sh
# Runs via nginx's /docker-entrypoint.d before nginx starts. Writes the runtime
# config the SPA reads (window.__APP_CONFIG__) from this container's environment,
# so one image serves every citizen-facing portal.
set -e

: "${KEYCLOAK_URL:=http://localhost:7080}"
: "${KEYCLOAK_REALM:=citizen}"
: "${CLIENT_ID:=my-guyana}"
: "${PORTAL_KIND:=myguyana}"
: "${PORTAL_TITLE:=My Guyana}"
: "${PORTAL_SUBTITLE:=}"
: "${RESOLVER_URL:=http://localhost:7090}"
: "${NIS_API_URL:=http://localhost:7101}"
: "${GRO_API_URL:=http://localhost:7103}"
: "${PASSPORT_API_URL:=http://localhost:7104}"
: "${SCHOLARSHIPS_API_URL:=http://localhost:7105}"
: "${LINKS:=[]}"

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__APP_CONFIG__ = {
  keycloakUrl: "${KEYCLOAK_URL}",
  realm: "${KEYCLOAK_REALM}",
  clientId: "${CLIENT_ID}",
  kind: "${PORTAL_KIND}",
  title: "${PORTAL_TITLE}",
  subtitle: "${PORTAL_SUBTITLE}",
  resolverUrl: "${RESOLVER_URL}",
  registryUrls: {
    nis: "${NIS_API_URL}",
    gro: "${GRO_API_URL}",
    passport: "${PASSPORT_API_URL}",
    scholarships: "${SCHOLARSHIPS_API_URL}"
  },
  links: ${LINKS}
};
EOF

echo "[env-config] wrote runtime config for client '${CLIENT_ID}' (${PORTAL_KIND})"
