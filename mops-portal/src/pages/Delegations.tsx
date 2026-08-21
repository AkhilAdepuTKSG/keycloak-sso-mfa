import { useEffect, useState } from "react";
import { api } from "../api";
import { Delegation, DirUser } from "../types";
import { useMe } from "../App";

export function Delegations() {
  const me = useMe();
  const [list, setList] = useState<Delegation[]>([]);
  const [candidates, setCandidates] = useState<DirUser[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const canDelegate =
    (me.roles.includes("PERMANENT_SECRETARY") && me.agency === "MPS") ||
    me.roles.includes("IT_ADMIN") || me.roles.includes("MINISTRY_ADMIN");

  const [delegate, setDelegate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const load = () => api.get<Delegation[]>("/api/delegations").then(setList).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (canDelegate) api.get<DirUser[]>("/api/directory/users?role=CPO").then(setCandidates).catch(() => {});
  }, [canDelegate]);

  const create = async () => {
    setErr(null);
    try {
      const u = candidates.find((c) => c.sub === delegate);
      await api.post("/api/delegations", {
        delegateSub: delegate,
        delegateEmail: u?.email,
        delegatedRole: "PERMANENT_SECRETARY_APPROVER",
        scope: "EMPLOYMENT_APPROVAL",
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        reason,
      });
      setDelegate(""); setStartsAt(""); setEndsAt(""); setReason("");
      await load();
    } catch (e) { setErr(String(e)); }
  };

  const revoke = async (id: string) => { await api.post(`/api/delegations/${id}/revoke`); await load(); };

  return (
    <div>
      <h1>Delegations</h1>
      <p className="muted">
        Temporary, time-bound authority to approve as Permanent Secretary during an absence.
        Auto-expires — no role is ever permanently granted.
      </p>
      {err && <div className="error">{err}</div>}

      {canDelegate && (
        <div className="card form">
          <h3>Delegate approval authority</h3>
          <label>Delegate (a CPO)
            <select value={delegate} onChange={(e) => setDelegate(e.target.value)}>
              <option value="">Select…</option>
              {candidates.map((c) => <option key={c.sub} value={c.sub}>{c.name} ({c.email})</option>)}
            </select>
          </label>
          <div className="row">
            <label>From<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
            <label>Until<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
          </div>
          <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. PS on leave" /></label>
          <div className="muted small">Role: PERMANENT_SECRETARY_APPROVER · Scope: EMPLOYMENT_APPROVAL · Ministry: MPS (fixed)</div>
          <button className="btn primary" disabled={!delegate || !startsAt || !endsAt} onClick={create}>Create delegation</button>
        </div>
      )}

      <div className="card">
        <h3>Delegations</h3>
        <table>
          <thead><tr><th>Delegator</th><th>Delegate</th><th>Role</th><th>Window</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td>{d.delegator_email}</td>
                <td>{d.delegate_email}</td>
                <td>{d.delegated_role}</td>
                <td>{new Date(d.starts_at).toLocaleString()} → {new Date(d.ends_at).toLocaleString()}</td>
                <td><span className={`badge s-${d.effectiveStatus}`}>{d.effectiveStatus}</span></td>
                <td>{d.effectiveStatus === "ACTIVE" && <button className="btn small danger" onClick={() => revoke(d.id)}>Revoke</button>}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="muted">No delegations.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
