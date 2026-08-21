#!/bin/sh
# Runs automatically via nginx's /docker-entrypoint.d mechanism BEFORE nginx
# starts. Generates the runtime config the SPA reads (window.__APP_CONFIG__)
# from this container's environment (set per service in docker-compose.yml).
set -e

: "${KEYCLOAK_URL:=http://localhost:8080}"
: "${KEYCLOAK_REALM:=citizens}"
: "${CLIENT_ID:=citizen-portal}"
: "${PORTAL_TITLE:=Citizen Portal}"
: "${PORTAL_KIND:=hub}"
: "${PORTAL_THEME:=orange}"
: "${LINKS:=[]}"

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__APP_CONFIG__ = {
  keycloakUrl: "${KEYCLOAK_URL}",
  realm: "${KEYCLOAK_REALM}",
  clientId: "${CLIENT_ID}",
  portalTitle: "${PORTAL_TITLE}",
  portalKind: "${PORTAL_KIND}",
  theme: "${PORTAL_THEME}",
  links: ${LINKS}
};
EOF

echo "[env-config] wrote runtime config for client '${CLIENT_ID}' (${PORTAL_KIND})"
