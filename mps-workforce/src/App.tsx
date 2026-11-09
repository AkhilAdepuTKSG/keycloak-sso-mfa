import { useCallback, useEffect, useState } from "react";
import { keycloak } from "./keycloak";
import { config } from "./config";
import { EmployeeRecord, getEid, getEmployee } from "./api";

interface Claims {
  cid?: string;
  acr?: string;
  auth_time?: number;
  login_id_type?: string;
  [k: string]: unknown;
}

const FIELDS: { key: string; label: string; join?: string[] }[] = [
  { key: "eid", label: "EID" },
  { key: "name", label: "Name", join: ["first_name", "last_name"] },
  { key: "ministry", label: "Ministry" },
  { key: "job_title", label: "Job title" },
  { key: "grade", label: "Grade" },
  { key: "employment_status", label: "Status" },
  { key: "start_date", label: "Start date" },
  { key: "work_email", label: "Work email" },
  { key: "eid_issued_on", label: "EID issued" },
];

type State =
  | { state: "loading" }
  | { state: "ok"; records: EmployeeRecord[] }
  | { state: "none"; message: string }
  | { state: "error"; message: string };

export function App() {
  const claims = (keycloak.tokenParsed ?? {}) as Claims;
  const [employee, setEmployee] = useState<State>({ state: "loading" });
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(async () => {
    setEmployee({ state: "loading" });
    const eid = await getEid(claims.cid ?? "");
    if (!eid.ok) return setEmployee({ state: "error", message: eid.message });
    if (!eid.data) return setEmployee({ state: "none", message: "No EID is linked to this account." });
    const r = await getEmployee(eid.data);
    if (!r.ok) {
      return setEmployee(r.status === 404
        ? { state: "none", message: "The MPS register has no employee record for this EID." }
        : { state: "error", message: r.message });
    }
    setEmployee({ state: "ok", records: r.data.records });
  }, [claims.cid]);

  useEffect(() => {
    void load();
  }, [load]);

  const started = claims.auth_time ? new Date(claims.auth_time * 1000).toLocaleTimeString() : "—";

  return (
    <div className="page">
      <header className="banner">
        <div>
          <span className="kind">Ministry of Public Service · staff</span>
          <h1>MPS Workforce</h1>
        </div>
        <span className="client-badge">client: {config.clientId}</span>
      </header>

      <section className="card session">
        <div className="session-head">
          <h2>Signed in with Citizen 360</h2>
          <span className={`pill pill-${claims.acr ?? "none"}`}>assurance: {claims.acr ?? "—"}</span>
        </div>
        <dl className="facts">
          <div><dt>Citizen ID (cid)</dt><dd className="mono">{claims.cid ?? "—"}</dd></div>
          <div><dt>Session established with</dt><dd>{claims.login_id_type ?? "—"}</dd></div>
          <div><dt>Session started</dt><dd>{started}</dd></div>
        </dl>
      </section>

      {claims.acr !== "high" && (
        <section className="card alert" role="alert">
          <h3>High assurance missing</h3>
          <p>This token's acr is <code>{claims.acr ?? "none"}</code>. MPS Workforce expects <code>high</code>.</p>
        </section>
      )}

      <section className="card">
        <h2 className="section-title">Your employee record · MPS register</h2>
        {employee.state === "loading" && <p className="muted">Loading…</p>}
        {employee.state === "none" && <p className="muted">{employee.message}</p>}
        {employee.state === "error" && (
          <>
            <p className="error-text" role="alert">{employee.message}</p>
            <button className="btn" onClick={() => void load()}>Try again</button>
          </>
        )}
        {employee.state === "ok" &&
          employee.records.map((rec) => (
            <div key={String(rec.id)} className="record">
              <dl className="facts">
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <dt>{f.label}</dt>
                    <dd>{f.join ? f.join.map((k) => rec[k]).filter(Boolean).join(" ") : rec[f.key] ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              <p className="muted small mono">mps registry record #{String(rec.id)}</p>
            </div>
          ))}
      </section>

      <section className="card">
        <div className="row">
          <button className="btn" onClick={() => setShowRaw((v) => !v)}>{showRaw ? "Hide" : "Show"} token claims</button>
          <button className="btn danger" onClick={() => keycloak.logout({ redirectUri: window.location.origin + "/" })}>
            Sign out
          </button>
        </div>
        {showRaw && <pre className="raw">{JSON.stringify(claims, null, 2)}</pre>}
      </section>

      <footer className="muted">MPS Workforce · Citizen 360 SSO POC · synthetic data, fictional people</footer>
    </div>
  );
}
