import Keycloak from "keycloak-js";
import { appConfig } from "./appConfig";

// One Keycloak instance per portal (each portal is a distinct client in the
// same `citizens` realm). Because all four clients share the realm, the first
// login establishes a realm SSO session; every other portal then authenticates
// silently against that same session — no second credential prompt.
export const keycloak = new Keycloak({
  url: appConfig.keycloakUrl,
  realm: appConfig.realm,
  clientId: appConfig.clientId,
});
