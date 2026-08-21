import { createContext, useContext, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { keycloak } from "./keycloak";
import { api } from "./api";
import { Me } from "./types";
import { Dashboard } from "./pages/Dashboard";
import { NewRequest, RequestList, RequestDetail } from "./pages/Requests";
import { Delegations } from "./pages/Delegations";
import { Provisioning } from "./pages/Provisioning";
import { Audit } from "./pages/Audit";

const MeContext = createContext<Me | null>(null);
export const useMe = (): Me => useContext(MeContext)!;

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Me>("/api/me").then(setMe).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="fatal"><h1>Backend error</h1><pre>{error}</pre></div>;
  if (!me) return <div className="fatal">Loading…</div>;

  const persona = me.isMoPSStaff
    ? `MoPS Staff · ${me.agency}`
    : me.isOriginator
      ? `Agency Originator · ${me.agency}`
      : `Employee · ${me.agency ?? "—"}`;

  return (
    <MeContext.Provider value={me}>
      <BrowserRouter>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">MPS Workforce</div>
            <div className="whoami">
              <div className="name">{me.name}</div>
              <div className="persona">{persona}</div>
              {me.actingAsDelegate && (
                <div className="acting">acting as {me.actingAsDelegate.role} (until{" "}
                  {new Date(me.actingAsDelegate.expiresAt).toLocaleString()})</div>
              )}
            </div>
            <nav>
              <NavLink to="/" end>Dashboard</NavLink>
              {me.isOriginator && <NavLink to="/new">New Request</NavLink>}
              <NavLink to="/requests">Requests</NavLink>
              {(me.canApproveAsPS || me.canProvision || me.roles.includes("PERMANENT_SECRETARY")) && (
                <NavLink to="/delegations">Delegations</NavLink>
              )}
              {me.canProvision && <NavLink to="/provisioning">Provisioning</NavLink>}
              {me.canProvision && <NavLink to="/audit">Audit</NavLink>}
            </nav>
            <button className="btn logout" onClick={() => keycloak.logout({ redirectUri: window.location.origin })}>
              Log out
            </button>
          </aside>
          <main className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new" element={me.isOriginator ? <NewRequest /> : <Navigate to="/" />} />
              <Route path="/requests" element={<RequestList />} />
              <Route path="/requests/:id" element={<RequestDetail />} />
              <Route path="/delegations" element={<Delegations />} />
              <Route path="/provisioning" element={me.canProvision ? <Provisioning /> : <Navigate to="/" />} />
              <Route path="/audit" element={me.canProvision ? <Audit /> : <Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </MeContext.Provider>
  );
}
