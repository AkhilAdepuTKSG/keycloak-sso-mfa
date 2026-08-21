import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { DirUser, EmploymentRequest, RequestDetail as RD } from "../types";
import { useMe } from "../App";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted",
  ASSIGNED_TO_HR: "With HR",
  VALIDATED: "Validated",
  ENDORSED: "Awaiting PS approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

function Badge({ status }: { status: string }) {
  return <span className={`badge s-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

// ---- Originate --------------------------------------------------------------
export function NewRequest() {
  const nav = useNavigate();
  const [positionTitle, setPositionTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [justification, setJustification] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<EmploymentRequest>("/api/employment-requests", {
        positionTitle,
        details: { department, justification },
      });
      nav(`/requests/${r.id}`);
    } catch (e) {
      setErr(String(e)); setBusy(false);
    }
  };

  return (
    <div>
      <h1>New Employment Request</h1>
      <p className="muted">Raised on behalf of your agency, submitted into the Ministry of Public Service.</p>
      <div className="card form">
        <label>Position title<input value={positionTitle} onChange={(e) => setPositionTitle(e.target.value)} placeholder="e.g. Registered Nurse" /></label>
        <label>Department<input value={department} onChange={(e) => setDepartment(e.target.value)} /></label>
        <label>Justification<textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={4} /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={!positionTitle || busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit to MPS"}
        </button>
      </div>
    </div>
  );
}

// ---- List -------------------------------------------------------------------
export function RequestList() {
  const [reqs, setReqs] = useState<EmploymentRequest[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<EmploymentRequest[]>("/api/employment-requests").then(setReqs).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div>
      <h1>Requests</h1>
      {err && <div className="error">{err}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Reference</th><th>Position</th><th>Origin</th><th>Status</th><th>Raised</th><th></th></tr></thead>
          <tbody>
            {reqs.map((r) => (
              <tr key={r.id}>
                <td>{r.reference}</td>
                <td>{r.position_title}</td>
                <td>{r.origin_agency}</td>
                <td><Badge status={r.status} /></td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td><Link to={`/requests/${r.id}`}>Open</Link></td>
              </tr>
            ))}
            {reqs.length === 0 && <tr><td colSpan={6} className="muted">No requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Detail + actions -------------------------------------------------------
export function RequestDetail() {
  const { id } = useParams();
  const me = useMe();
  const [data, setData] = useState<RD | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [hrOfficers, setHrOfficers] = useState<DirUser[]>([]);
  const [hrPick, setHrPick] = useState("");

  const load = () => api.get<RD>(`/api/employment-requests/${id}`).then(setData).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (data?.status === "SUBMITTED" && me.roles.includes("CPO")) {
      api.get<DirUser[]>("/api/directory/users?role=HR_OFFICER").then(setHrOfficers).catch(() => {});
    }
  }, [data?.status]);

  if (err) return <div className="error">{err}</div>;
  if (!data) return <div className="muted">Loading…</div>;

  const act = async (path: string, body?: unknown) => {
    setErr(null);
    try { await api.post(`/api/employment-requests/${data.id}/${path}`, body); await load(); setNote(""); }
    catch (e) { setErr(String(e)); }
  };

  const isAssignedHr = me.roles.includes("HR_OFFICER") && data.assigned_to_sub === me.sub;

  return (
    <div>
      <h1>{data.reference} <Badge status={data.status} /></h1>
      <div className="card">
        <dl className="kv">
          <div><dt>Position</dt><dd>{data.position_title}</dd></div>
          <div><dt>Origin agency</dt><dd>{data.origin_agency}</dd></div>
          <div><dt>Handling</dt><dd>{data.handling_agency}</dd></div>
          <div><dt>Raised by</dt><dd>{data.created_by_email}</dd></div>
          {data.assigned_to_email && <div><dt>Assigned HR</dt><dd>{data.assigned_to_email}</dd></div>}
          {(data.details?.department as string) && <div><dt>Department</dt><dd>{String(data.details.department)}</dd></div>}
        </dl>
        {(data.details?.justification as string) && <p className="muted">{String(data.details.justification)}</p>}
      </div>

      {/* Action panel — backend is the source of truth; this only reflects it. */}
      <div className="card">
        <h3>Actions</h3>
        {data.status === "SUBMITTED" && me.roles.includes("CPO") && (
          <div className="form inline">
            <select value={hrPick} onChange={(e) => setHrPick(e.target.value)}>
              <option value="">Select HR officer…</option>
              {hrOfficers.map((u) => <option key={u.sub} value={u.sub}>{u.name} ({u.email})</option>)}
            </select>
            <button className="btn primary" disabled={!hrPick}
              onClick={() => { const u = hrOfficers.find((x) => x.sub === hrPick)!; act("assign", { assignedToSub: u.sub, assignedToEmail: u.email }); }}>
              Assign to HR
            </button>
          </div>
        )}
        {data.status === "ASSIGNED_TO_HR" && isAssignedHr && (
          <div className="form">
            <label>Validation note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <button className="btn primary" onClick={() => act("validate", { note })}>Mark validated → CPO</button>
          </div>
        )}
        {data.status === "VALIDATED" && me.roles.includes("CPO") && (
          <button className="btn primary" onClick={() => act("endorse")}>Endorse → Permanent Secretary</button>
        )}
        {data.status === "ENDORSED" && me.canApproveAsPS && (
          <div className="form">
            {me.actingAsDelegate && <div className="notice small">You are approving under a delegation from {me.actingAsDelegate.delegatedBy}.</div>}
            <label>Effective joining date<input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} /></label>
            <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="row">
              <button className="btn primary" onClick={() => act("approve", { effectiveJoiningDate: joiningDate, note })}>Approve → generate minute</button>
              <button className="btn" onClick={() => act("send-back", { note })}>Send back to HR</button>
              <button className="btn danger" onClick={() => act("reject", { note })}>Reject</button>
            </div>
          </div>
        )}
        {!["SUBMITTED", "ASSIGNED_TO_HR", "VALIDATED", "ENDORSED"].includes(data.status) && (
          <p className="muted">No further actions — request is {STATUS_LABEL[data.status]}.</p>
        )}
        {["SUBMITTED", "ASSIGNED_TO_HR", "VALIDATED", "ENDORSED"].includes(data.status) &&
          !(me.roles.includes("CPO") || isAssignedHr || me.canApproveAsPS) && (
            <p className="muted">Nothing for your role to do at this stage.</p>
          )}
      </div>

      {data.minute && (
        <div className="card notice">
          <h3>📄 Minute generated</h3>
          <pre className="raw">{JSON.stringify(data.minute.document, null, 2)}</pre>
        </div>
      )}

      <div className="card">
        <h3>History</h3>
        <table>
          <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Effective role</th><th>Note</th></tr></thead>
          <tbody>
            {data.transitions.map((t, i) => (
              <tr key={i}>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td>{t.action}</td>
                <td>{t.actor_email}</td>
                <td>{t.effective_role}{t.delegated_by_sub ? " (delegated)" : ""}</td>
                <td>{t.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
