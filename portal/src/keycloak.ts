import Keycloak from "keycloak-js";
import { appConfig } from "./appConfig";

// One Keycloak client per portal, all in the `citizen` realm. The first login
// creates the realm SSO session; every other portal then signs in silently.
// The required assurance level (acr) is set on each client in Keycloak
// (default.acr.values), so MPS asks for "high" without code here.
export const keycloak = new Keycloak({
  url: appConfig.keycloakUrl,
  realm: appConfig.realm,
  clientId: appConfig.clientId,
});
