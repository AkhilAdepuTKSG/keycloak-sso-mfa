# Production-pattern Keycloak: build an optimized image against Postgres, then
# run in production mode (`start --optimized`). This is the recommended prod
# build (config baked at build time, fast startup) rather than `start-dev`.
FROM quay.io/keycloak/keycloak:26.0 AS builder
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.0
COPY --from=builder /opt/keycloak/ /opt/keycloak/
# Realm definitions imported on first start (empty DB).
COPY realms/ /opt/keycloak/data/import/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
