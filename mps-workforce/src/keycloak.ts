import Keycloak from "keycloak-js";
import { config } from "./config";

// Client mps-portal in the same `citizen` realm. Keycloak requires acr "high" for it
// (default.acr.values + minimum.acr.value), so a session reached with any other ID
// runs only the EID step-up, and a person without an EID gets the enrol page.
export const keycloak = new Keycloak({
  url: config.keycloakUrl,
  realm: config.realm,
  clientId: config.clientId,
});
