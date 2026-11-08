import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { keycloak } from "./keycloak";
import { appConfig } from "./appConfig";
import { App } from "./App";
import "./styles.css";

document.documentElement.setAttribute("data-portal", appConfig.kind);
document.title = appConfig.title;

const root = createRoot(document.getElementById("root")!);

// login-required: with an existing realm SSO session Keycloak redirects straight
// back without a form — that silent round trip is the SSO. When the session is
// below this client's required assurance level, Keycloak runs only the step-up.
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
    const home = appConfig.links.find((l) => l.kind === "myguyana")?.url;
    root.render(
      <div className="page">
        <header className="banner">
          <div>
            <span className="kind">{appConfig.subtitle}</span>
            <h1>{appConfig.title}</h1>
          </div>
        </header>
        {code === "access_denied" ? (
          <section className="card alert" role="alert">
            <h3>Sign-in not completed</h3>
            <p>
              {appConfig.kind === "mps"
                ? "MPS Workforce needs High assurance, which comes from an EID linked to your account."
                : "The sign-in was cancelled."}
            </p>
            <div className="row">
              <button className="btn" onClick={() => keycloak.login()}>Try again</button>
              {home && <a className="btn" href={home}>Go to My Guyana</a>}
            </div>
          </section>
        ) : (
          <section className="card alert" role="alert">
            <h3>Could not reach the sign-in service</h3>
            <p>Is Keycloak running at <code>{appConfig.keycloakUrl}</code>?</p>
            <pre className="raw">{JSON.stringify(err ?? "unknown error")}</pre>
            <button className="btn" onClick={() => window.location.assign("/")}>Try again</button>
          </section>
        )}
      </div>,
    );
  });
