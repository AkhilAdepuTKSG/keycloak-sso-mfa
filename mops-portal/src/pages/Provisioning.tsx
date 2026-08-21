import { useEffect, useState } from "react";
import { api } from "../api";
import { AgencyRef } from "../types";

interface KcUser { id: string; username: string; email?: string; firstName?: string; lastName?: string; enabled: boolean; }

const ASSIGNABLE_ROLES = ["EMPLOYEE", "HR_OFFICER", "CPO", "PERMANENT_SECRETARY", "MINISTER", "CONFIDENTIAL_SECRETARY", "IT_ADMIN"];

export function Provisioning() {
  const [users, setUsers] = useState<KcUser[]>([]);
  const [agencies, setAgencies] = useState<AgencyRef[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    username: "", email: "", firstName: "", lastName: "", password: "",
    agency: "MPS", designateOriginator: false, roles: [] as string[],
  });

  const load = () => api.get<KcUser[]>("/api/admin/users").then(setUsers).catch((e) => setErr(String(e)));
  useEffect(() => { load(); api.get<AgencyRef[]>("/api/admin/agencies").then(setAgencies).catch(() => {}); }, []);

  const toggleRole = (r: string) =>
    setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));

  const create = async () => {
    setErr(null); setMsg(null);
    try {
      await api.post("/api/admin/users", form);
      setMsg(`Provisioned ${form.username}. They set a new password on first login.`);
      setForm({ username: "", email: "", firstName: "", lastName: "", password: "", agency: "MPS", designateOriginator: false, roles: [] });
      await load();
    } catch (e) { setErr(String(e)); }
  };

  const selectedAgency = agencies.find((a) => a.code === form.agency);

  return (
    <div>
      <h1>User Provisioning</h1>
      <p className="muted">
        IT Admin only. The backend creates users via the provisioning service account —
        you never touch the Keycloak console. Every action is audited.
      </p>
      {err && <div className="error">{err}</div>}
      {msg && <div className="notice small">{msg}</div>}

      <div className="card form">
        <h3>Provision a workforce user</h3>
        <div className="row">
          <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        </div>
        <div className="row">
          <label>First name<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
          <label>Last name<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
        </div>
        <div className="row">
          <label>Temp password<input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min 10 chars, 1 special" /></label>
          <label>Agency
            <select value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value, designateOriginator: false })}>
              {agencies.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </label>
        </div>
        {selectedAgency?.canOriginate && (
          <label className="check">
            <input type="checkbox" checked={form.designateOriginator} onChange={(e) => setForm({ ...form, designateOriginator: e.target.checked })} />
            Designate as Agency Originator (adds to {form.agency}/Originators — grants AGENCY_ORIGINATOR)
          </label>
        )}
        <div>
          <div className="muted small">Standing roles</div>
          <div className="chips">
            {ASSIGNABLE_ROLES.map((r) => (
              <button key={r} type="button" className={`chip ${form.roles.includes(r) ? "on" : ""}`} onClick={() => toggleRole(r)}>{r}</button>
            ))}
          </div>
        </div>
        <button className="btn primary" disabled={!form.username || !form.email || !form.password} onClick={create}>Provision user</button>
      </div>

      <div className="card">
        <h3>Existing users</h3>
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Enabled</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{[u.firstName, u.lastName].filter(Boolean).join(" ")}</td>
                <td>{u.email}</td>
                <td>{u.enabled ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
