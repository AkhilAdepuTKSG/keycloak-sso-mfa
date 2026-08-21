import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { keycloak } from "./keycloak";
import { appConfig } from "./appConfig";
import { App } from "./App";
import "./styles.css";

// Apply the per-portal brand colour (orange/teal/green/blue) before render.
document.documentElement.setAttribute("data-theme", appConfig.theme);

const root = createRoot(document.getElementById("root")!);

// `login-required` forces authentication on load. When the realm SSO session
// already exists (because the citizen logged in at another portal), Keycloak
// redirects straight back with no login form — that silent round-trip IS the
// SSO. `checkLoginIframe: false` avoids third-party-cookie iframe issues and
// makes the demo behave consistently across browsers.
keycloak
  .init({
    onLoad: "login-required",
    pkceMethod: "S256",
    checkLoginIframe: false,
    responseMode: "query",
  })
  .then((authenticated) => {
    if (!authenticated) {
      keycloak.login();
      return;
    }
    // Keep the access token fresh while the tab is open.
    setInterval(() => {
      keycloak.updateToken(60).catch(() => keycloak.login());
    }, 30000);

    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err) => {
    root.render(
      <div className="fatal">
        <h1>Could not reach Keycloak</h1>
        <p>Is Keycloak running at <code>{keycloak.authServerUrl}</code>?</p>
        <pre>{String(err)}</pre>
      </div>,
    );
  });
