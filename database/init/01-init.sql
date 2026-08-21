-- Runs once on first Postgres init. Creates the two databases:
--   keycloak  -> Keycloak's own store (production mode uses an external DB)
--   appdb     -> the workforce application (workflow, delegation, audit, ...)
CREATE DATABASE keycloak;
CREATE DATABASE appdb;
