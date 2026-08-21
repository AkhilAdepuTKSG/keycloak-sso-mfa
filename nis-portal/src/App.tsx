import { useEffect, useState } from "react";
import { keycloak } from "./keycloak";
import { api, refreshToken } from "./api";

interface Me { name: string; email: string; roles: string[]; nisEnrolled: boolean; }
interface Contributions { nisNumber: string; contributions: { period: string; amount: number; status: string }[]; }

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMe = () => api.get<Me>("/api/me").then(setMe).catch((e) => setError(String(e)));
  useEffect(() => { loadMe(); }, []);

  const logout = () => keycloak.logout({ redirectUri: window.location.origin });

  return (
    <div className="page">
      <header className="banner">
        <div>
          <span className="kind">NATIONAL INSURANCE SCHEME</span>
          <h1>NIS Services</h1>
        </div>
        <button className="btn" onClick={logout}>Log out</button>
      </header>
      <main>
        {error && <div className="error">{error}</div>}
        {!me && !error && <div className="muted">Loading…</div>}
        {me && !me.nisEnrolled && <Register name={me.name} onDone={async () => { await refreshToken(); await loadMe(); }} />}
        {me && me.nisEnrolled && <Enrolled />}
      </main>
      <footer className="muted">
        Signed in as {me?.email} · realm <code>{keycloak.realm}</code>
      </footer>
    </div>
  );
}

// --- Gate + registration (shown when the citizen has no NIS enrolment) -------
function Register({ name, onDone }: { name: string; onDone: () => Promise<void> }) {
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("EMPLOYED");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nisNumber, setNisNumber] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ nisNumber: string }>("/api/nis/enrol", { dateOfBirth, employmentStatus, address });
      setNisNumber(r.nisNumber);
      // Give the citizen a moment to see their new number, then refresh token + reload.
      setTimeout(() => { onDone(); }, 1500);
    } catch (e) { setErr(String(e)); setBusy(false); }
  };

  if (nisNumber) {
    return (
      <div className="card success">
        <h2>✓ You're enrolled in NIS</h2>
        <p>Your National Insurance number is <strong>{nisNumber}</strong>. Loading your services…</p>
      </div>
    );
  }

  return (
    <>
      <div className="card gate">
        <h2>🔒 NIS registration required</h2>
        <p className="muted">
          {name}, you're signed in with your government citizen account, but you don't have an
          NIS number yet. Register below — this updates your existing account (no new login).
        </p>
      </div>
      <div className="card form">
        <h3>Register for NIS</h3>
        <label>Date of birth<input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></label>
        <label>Employment status
          <select value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value)}>
            <option value="EMPLOYED">Employed</option>
            <option value="SELF_EMPLOYED">Self-employed</option>
            <option value="UNEMPLOYED">Unemployed</option>
          </select>
        </label>
        <label>Address<textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={!dateOfBirth || busy} onClick={submit}>
          {busy ? "Registering…" : "Register for NIS"}
        </button>
      </div>
    </>
  );
}

// --- Enrolled dashboard (NIS_MEMBER role now present in the token) -----------
function Enrolled() {
  const [data, setData] = useState<Contributions | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.get<Contributions>("/api/nis/contributions").then(setData).catch((e) => setErr(String(e))); }, []);

  return (
    <div>
      <div className="card success">
        <h2>✓ NIS member</h2>
        <p>Your National Insurance number: <strong>{data?.nisNumber ?? "…"}</strong></p>
      </div>
      <div className="card">
        <h3>Contributions</h3>
        {err && <div className="error">{err}</div>}
        <table>
          <thead><tr><th>Period</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {(data?.contributions ?? []).map((c) => (
              <tr key={c.period}><td>{c.period}</td><td>{c.amount}</td><td>{c.status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
