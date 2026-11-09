#!/bin/sh
# Runs via nginx's /docker-entrypoint.d before nginx starts. Writes the runtime
# config the SPA reads (window.__APP_CONFIG__) from this container's environment.
set -e

: "${KEYCLOAK_URL:=http://localhost:7080}"
: "${KEYCLOAK_REALM:=citizen}"
: "${CLIENT_ID:=mps-portal}"
: "${RESOLVER_URL:=http://localhost:7090}"
: "${MPS_API_URL:=http://localhost:7102}"

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__APP_CONFIG__ = {
  keycloakUrl: "${KEYCLOAK_URL}",
  realm: "${KEYCLOAK_REALM}",
  clientId: "${CLIENT_ID}",
  resolverUrl: "${RESOLVER_URL}",
  mpsApiUrl: "${MPS_API_URL}"
};
EOF

echo "[env-config] wrote runtime config for MPS Workforce (client '${CLIENT_ID}')"
