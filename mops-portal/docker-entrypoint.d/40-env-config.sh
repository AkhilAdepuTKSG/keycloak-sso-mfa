#!/bin/sh
set -e
: "${KEYCLOAK_URL:=http://localhost:8080}"
: "${KEYCLOAK_REALM:=gov}"
: "${CLIENT_ID:=mps-portal}"
: "${API_BASE_URL:=http://localhost:4000}"

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__APP_CONFIG__ = {
  keycloakUrl: "${KEYCLOAK_URL}",
  realm: "${KEYCLOAK_REALM}",
  clientId: "${CLIENT_ID}",
  apiBaseUrl: "${API_BASE_URL}"
};
EOF
echo "[env-config] wrote runtime config for '${CLIENT_ID}'"
