import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { keycloak } from "./keycloak";
import { config } from "./config";
import { App } from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

keycloak
  .init({ onLoad: "login-required", pkceMethod: "S256", checkLoginIframe: false, responseMode: "query" })
  .then((authenticated) => {
    if (!authenticated) {
      keycloak.login();
      return;
    }
    setInterval(() => {
      keycloak.updateToken(60).catch(() => keycloak.login());
    }, 30000);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const code = (err as { error?: string } | undefined)?.error;
    root.render(
      <div className="page">
        <header className="banner">
          <div>
            <span className="kind">Ministry of Public Service · staff</span>
            <h1>MPS Workforce</h1>
          </div>
        </header>
        {code === "access_denied" ? (
          <section className="card alert" role="alert">
            <h3>Sign-in not completed</h3>
            <p>MPS Workforce needs High assurance, which comes from an EID linked to your account.</p>
            <button className="btn" onClick={() => keycloak.login()}>Try again</button>
          </section>
        ) : (
          <section className="card alert" role="alert">
            <h3>Could not reach the sign-in service</h3>
            <p>Is Keycloak running at <code>{config.keycloakUrl}</code>?</p>
            <pre className="raw">{JSON.stringify(err ?? "unknown error")}</pre>
            <button className="btn" onClick={() => window.location.assign("/")}>Try again</button>
          </section>
        )}
      </div>,
    );
  });
