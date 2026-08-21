# Production-pattern Keycloak, now WITH the SMS magic-link MFA provider baked in.
# Stage 0 compiles the provider JAR (no local JDK/Maven needed); the optimized
# Keycloak build then runs with the provider already in /opt/keycloak/providers,
# so `kc.sh build` registers it and its config properties appear in the console.

# --- Stage 0: build the SMS magic-link provider JAR ---
FROM maven:3.9-eclipse-temurin-17 AS plugin
WORKDIR /build
COPY plugins/sms-magic-link-mfa/pom.xml ./pom.xml
COPY plugins/sms-magic-link-mfa/src ./src
RUN mvn -q -B clean package

# --- Stage 1: optimized Keycloak build WITH the provider present ---
FROM quay.io/keycloak/keycloak:26.0.5 AS builder
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
COPY --from=plugin /build/target/keycloak-sms-link.jar /opt/keycloak/providers/
RUN /opt/keycloak/bin/kc.sh build

# --- Stage 2: runtime ---
FROM quay.io/keycloak/keycloak:26.0.5
COPY --from=builder /opt/keycloak/ /opt/keycloak/
# Realm definitions imported on first start (empty DB).
COPY realms/ /opt/keycloak/data/import/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
