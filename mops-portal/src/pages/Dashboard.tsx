import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { EmploymentRequest } from "../types";
import { useMe } from "../App";

export function Dashboard() {
  const me = useMe();
  const [reqs, setReqs] = useState<EmploymentRequest[]>([]);

  useEffect(() => {
    api.get<EmploymentRequest[]>("/api/employment-requests").then(setReqs).catch(() => setReqs([]));
  }, []);

  const count = (s: string) => reqs.filter((r) => r.status === s).length;

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">
        Signed in as <strong>{me.name}</strong> — {me.roles.join(", ") || "no roles"} · agency{" "}
        <strong>{me.agency ?? "—"}</strong>
      </p>

      {me.actingAsDelegate && (
        <div className="card notice">
          You are currently <strong>acting as {me.actingAsDelegate.role}</strong> by delegation from{" "}
          {me.actingAsDelegate.delegatedBy}, until {new Date(me.actingAsDelegate.expiresAt).toLocaleString()}.
          Approvals you make are recorded under this delegated authority.
        </div>
      )}

      <div className="stats">
        <div className="stat"><span>{count("SUBMITTED")}</span>Submitted</div>
        <div className="stat"><span>{count("ASSIGNED_TO_HR")}</span>With HR</div>
        <div className="stat"><span>{count("VALIDATED")}</span>Validated</div>
        <div className="stat"><span>{count("ENDORSED")}</span>Awaiting approval</div>
        <div className="stat"><span>{count("APPROVED")}</span>Approved</div>
        <div className="stat"><span>{count("REJECTED")}</span>Rejected</div>
      </div>

      <div className="card">
        <h3>What you can do</h3>
        <ul>
          {me.isOriginator && <li><Link to="/new">Raise an employment request</Link> into MPS on behalf of {me.agency}.</li>}
          {me.roles.includes("CPO") && <li>Assign submitted requests to HR, then endorse validated ones (<Link to="/requests">Requests</Link>).</li>}
          {me.roles.includes("HR_OFFICER") && <li>Validate requests assigned to you (<Link to="/requests">Requests</Link>).</li>}
          {me.canApproveAsPS && <li>Give final approval to endorsed requests (<Link to="/requests">Requests</Link>).</li>}
          {me.roles.includes("PERMANENT_SECRETARY") && me.agency === "MPS" && <li>Delegate your approval authority while away (<Link to="/delegations">Delegations</Link>).</li>}
          {me.canProvision && <li>Provision workforce users (<Link to="/provisioning">Provisioning</Link>) and review the <Link to="/audit">audit trail</Link>.</li>}
        </ul>
      </div>
    </div>
  );
}
