import { useEffect, useState } from "react";
import { api } from "../api";
import { AuditEvent } from "../types";

export function Audit() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<AuditEvent[]>("/api/audit").then(setEvents).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div>
      <h1>Audit Trail</h1>
      <p className="muted">Every authorization decision on requests, delegations and provisioning — including the effective role and delegation lineage.</p>
      {err && <div className="error">{err}</div>}
      <div className="card">
        <table>
          <thead><tr><th>When</th><th>Actor</th><th>Agency</th><th>Action</th><th>Resource</th><th>Effective role</th><th>Delegated</th><th>Result</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.actor_email}</td>
                <td>{e.actor_agency ?? ""}</td>
                <td>{e.action}</td>
                <td>{e.resource_ref ?? e.resource_type}</td>
                <td>{e.effective_role ?? ""}</td>
                <td>{e.delegated ? "yes" : ""}</td>
                <td><span className={`badge s-${e.result}`}>{e.result}</span></td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={8} className="muted">No events yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
