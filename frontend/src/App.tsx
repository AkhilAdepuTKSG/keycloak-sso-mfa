import { useMemo, useState } from "react";
import { keycloak } from "./keycloak";
import { appConfig } from "./appConfig";

interface TokenClaims {
  preferred_username?: string;
  email?: string;
  name?: string;
  sub?: string;
  exp?: number;
  iss?: string;
  azp?: string;
  agency?: string[] | string; // from the group-membership mapper (gov realm)
  realm_access?: { roles?: string[] };
  [k: string]: unknown;
}

// The central ministry that processes cross-agency employment requests.
const MPS = "MPS";

// Friendly names for agency codes (agency itself comes from the group claim).
const AGENCY_NAMES: Record<string, string> = {
  MPS: "Ministry of Public Service",
  MOH: "Ministry of Health",
  MOF: "Ministry of Finance",
  MOA: "Ministry of Agriculture",
  MOE: "Ministry of Education",
  REG4: "Region 4",
};

// MoPS internal staff (processor) roles — the roles that run the workflow.
const PROCESSOR_ROLES = [
  "PERMANENT_SECRETARY",
  "CPO",
  "HR_OFFICER",
  "MINISTER",
  "CONFIDENTIAL_SECRETARY",
  "IT_ADMIN",
];

const ROLE_LABELS: Record<string, string> = {
  PERMANENT_SECRETARY: "Permanent Secretary",
  CPO: "Chief Personnel Officer",
  HR_OFFICER: "HR Officer",
  MINISTER: "Minister",
  CONFIDENTIAL_SECRETARY: "Confidential Secretary",
  IT_ADMIN: "IT Administrator",
  AGENCY_ORIGINATOR: "Agency Originator",
  EMPLOYEE: "Employee",
  MINISTRY_ADMIN: "Ministry Admin",
};

export function App() {
  const claims = (keycloak.tokenParsed ?? {}) as TokenClaims;
  const [showRaw, setShowRaw] = useState(false);

  const roles = claims.realm_access?.roles ?? [];
  const isHub = appConfig.portalKind === "hub";
  const isGov = appConfig.realm === "gov";
  const hasLinks = appConfig.links.length > 0;

  // user_type is DERIVED from the realm — no custom claim needed.
  const userType = isGov ? "GOVERNMENT_EMPLOYEE" : "CITIZEN";

  // Agency comes from the group-membership claim (may be an array).
  const agencyCode = Array.isArray(claims.agency) ? claims.agency[0] : claims.agency;
  const agencyName = agencyCode ? AGENCY_NAMES[agencyCode] ?? agencyCode : undefined;

  // ---- Persona differentiation INSIDE the single MoPS portal ----------------
  // Rule: role = what you can do; agency = who you are / whose data you're scoped to.
  const isAgencyOriginator = roles.includes("AGENCY_ORIGINATOR");
  const processorRole = roles.find((r) => PROCESSOR_ROLES.includes(r));
  const isMoPSStaff = agencyCode === MPS && !!processorRole;

  const kindLabel = isGov
    ? isMoPSStaff
      ? "MPS STAFF · WORKFLOW PROCESSOR"
      : isAgencyOriginator
        ? "AGENCY ORIGINATOR"
        : "GOVERNMENT EMPLOYEE"
    : isHub
      ? "CITIZEN SSO HUB"
      : "CITIZEN SERVICE";

  const expiresIn = useMemo(() => {
    if (!claims.exp) return "—";
    const secs = Math.max(0, claims.exp - Math.floor(Date.now() / 1000));
    return `${secs}s`;
  }, [claims.exp]);

  const logout = () => keycloak.logout({ redirectUri: window.location.origin });

  return (
    <div className="page">
      <header className="banner">
        <div>
          <span className="kind">{kindLabel}</span>
          <h1>{appConfig.portalTitle}</h1>
        </div>
        <span className="client-badge">client: {appConfig.clientId}</span>
      </header>

      <main>
        <section className="card success">
          <h2>✓ Authenticated via Single Sign-On</h2>
          <p className="muted">
            You reached <strong>{appConfig.portalTitle}</strong> without
            {isHub ? " " : " a second "}login — the realm session is shared across every portal.
          </p>
          <dl className="identity">
            <div><dt>Name</dt><dd>{claims.name ?? "—"}</dd></div>
            <div><dt>Username</dt><dd>{claims.preferred_username ?? "—"}</dd></div>
            <div><dt>Email</dt><dd>{claims.email ?? "—"}</dd></div>
            <div><dt>User type (from realm)</dt><dd>{userType}</dd></div>
            {isGov && (
              <div><dt>Agency (from group)</dt><dd>{agencyName ? `${agencyName} (${agencyCode})` : "—"}</dd></div>
            )}
            <div><dt>Realm roles</dt><dd>{roles.length ? roles.join(", ") : "—"}</dd></div>
            <div><dt>Realm (iss)</dt><dd className="mono">{claims.iss ?? "—"}</dd></div>
            <div><dt>This client (azp)</dt><dd className="mono">{claims.azp ?? "—"}</dd></div>
            <div><dt>Subject (sub)</dt><dd className="mono">{claims.sub ?? "—"}</dd></div>
            <div><dt>Access token expires in</dt><dd>{expiresIn}</dd></div>
          </dl>
        </section>

        {/* One portal, screens differentiated by agency + roles */}
        {isGov && isMoPSStaff && (
          <section className="card notice">
            <h3>🏛️ MoPS Staff view — {ROLE_LABELS[processorRole!] ?? processorRole}</h3>
            <p>
              You are internal staff of the <strong>Ministry of Public Service</strong>
              {" "}(<code>agency = MPS</code>). You process employment requests submitted by
              other agencies. Your workflow screens for this role would render here.
            </p>
            <p className="muted">
              Differentiator: <code>agency = MPS</code> <strong>and</strong> role{" "}
              <code>{processorRole}</code> → MoPS processor screens.
            </p>
          </section>
        )}

        {isGov && isAgencyOriginator && !isMoPSStaff && (
          <section className="card notice">
            <h3>📤 Agency Originator view — {agencyName}</h3>
            <p>
              You are a designated originator for <strong>{agencyName}</strong>
              {" "}(<code>agency = {agencyCode}</code>). You raise employment requests
              <em> into </em> the Ministry of Public Service ({MPS}) on behalf of your agency.
              Your origination screens would render here.
            </p>
            <p className="muted">
              Differentiator: role <code>AGENCY_ORIGINATOR</code> with{" "}
              <code>agency = {agencyCode}</code> (not MPS) → agency origination screens. Note your
              home agency stays <code>{agencyCode}</code> even while operating in the MPS portal.
            </p>
          </section>
        )}

        {isGov && roles.includes("IT_ADMIN") && (
          <section className="card notice">
            <h3>🛠️ IT Administrator — user provisioning</h3>
            <p>
              You provision MoPS staff and agency originators for the workforce system. The{" "}
              <code>IT_ADMIN</code> role gates these screens; the actual user creation is performed
              by Keycloak with the <code>manage-users</code> capability.
            </p>
            <p className="muted">
              Interim (this POC): you hold <code>realm-management</code> rights and can create users
              in the Keycloak admin console. Production target: a provisioning screen here → backend
              (checks <code>IT_ADMIN</code>) → <code>provisioning-service</code> service account →
              Keycloak Admin API, scoped to an agency group and audited. The human never gets direct
              console access.
            </p>
          </section>
        )}

        {isGov && !isMoPSStaff && !isAgencyOriginator && (
          <section className="card">
            <h3>Government employee</h3>
            <p className="muted">
              Signed in as an employee of <strong>{agencyName ?? "your agency"}</strong> with no
              workflow role assigned. No originator or processor screens apply.
            </p>
          </section>
        )}

        {hasLinks && (
          <section className="card">
            <h3>{isHub ? "Open a ministry service" : "Return to the Citizen Portal"}</h3>
            <p className="muted">
              {isHub
                ? "Opening any of these should land you already-authenticated — no credentials asked."
                : "Ministry services are launched from the Citizen Portal — head back there to open another one."}
            </p>
            <div className="links">
              {appConfig.links.map((l) => (
                <a key={l.url} className={`portal-link ${isHub ? "" : "back"}`} href={l.url}>
                  {isHub ? (
                    <>{l.title} <span className="arrow">→</span></>
                  ) : (
                    <><span className="arrow">←</span> {l.title}</>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="row">
            <button className="btn" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide" : "Show"} raw token claims
            </button>
            <button className="btn danger" onClick={logout}>
              Log out (single logout)
            </button>
          </div>
          {showRaw && <pre className="raw">{JSON.stringify(claims, null, 2)}</pre>}
        </section>
      </main>

      <footer className="muted">
        SSO POC · realm <code>{appConfig.realm}</code> · Keycloak{" "}
        <code>{appConfig.keycloakUrl}</code>
      </footer>
    </div>
  );
}
