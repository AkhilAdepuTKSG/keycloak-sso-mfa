# Keycloak for the citizen realm, production mode on PostgreSQL (`start --optimized`).
#
# Stage 1 compiles the Citizen 360 authenticator SPI against the exact jars that
# ship in this Keycloak image, so there is no Maven download and no version skew.
# Stage 2 bakes the provider into an optimized Keycloak build.
ARG KC_VERSION=26.2.5

FROM quay.io/keycloak/keycloak:${KC_VERSION} AS kc

FROM eclipse-temurin:21-jdk-alpine AS spi
WORKDIR /build
COPY --from=kc /opt/keycloak/lib/lib/main /kclib
COPY --from=kc /opt/keycloak/lib/lib/boot /kcboot
COPY spi/src ./src
RUN mkdir -p out \
 && javac --release 21 -nowarn -cp "/kclib/*:/kcboot/*" -d out $(find src/main/java -name '*.java') \
 && cp -r src/main/resources/. out/ \
 && cd out && jar cf /build/citizen360-keycloak-spi.jar .

FROM quay.io/keycloak/keycloak:${KC_VERSION} AS builder
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
COPY --from=spi /build/citizen360-keycloak-spi.jar /opt/keycloak/providers/
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:${KC_VERSION}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
# Realm definition imported on first start (empty DB).
COPY realms/ /opt/keycloak/data/import/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
