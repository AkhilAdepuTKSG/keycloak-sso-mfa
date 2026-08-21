import Keycloak from "keycloak-js";
import { appConfig } from "./config";

export const keycloak = new Keycloak({
  url: appConfig.keycloakUrl,
  realm: appConfig.realm,
  clientId: appConfig.clientId,
});
