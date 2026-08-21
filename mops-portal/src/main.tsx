import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { keycloak } from "./keycloak";
import { App } from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

keycloak
  .init({ onLoad: "login-required", pkceMethod: "S256", checkLoginIframe: false })
  .then((authenticated) => {
    if (!authenticated) {
      keycloak.login();
      return;
    }
    setInterval(() => keycloak.updateToken(60).catch(() => keycloak.login()), 30000);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err) => {
    root.render(
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Could not reach Keycloak</h1>
        <pre>{String(err)}</pre>
      </div>,
    );
  });
