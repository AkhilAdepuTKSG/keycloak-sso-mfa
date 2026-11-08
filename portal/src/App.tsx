import { useCallback, useEffect, useState } from "react";
import { keycloak } from "./keycloak";
import { appConfig, PortalKind } from "./appConfig";
import { getProfile, getRegistryRecords, Profile, RegistryKey, RegistryRecord, Result } from "./api";

interface Claims {
  sub?: string;
  cid?: string;
  acr?: string;
  azp?: string;
  auth_time?: number;
  login_id_type?: string;
  person_loa?: string;
  [k: string]: unknown;
}

const ID_LABELS: Record<string, string> = {
  NIS: "NIS number",
  NATIONAL_ID: "National ID",
  PASSPORT: "Passport",
  DL: "Driver’s licence",
  EID: "EID",
  GRO_BIRTH: "GRO birth registration",
  EMAIL: "Email (contact)",
  PHONE: "Phone (contact)",
};

const REGISTRY_TITLES: Record<RegistryKey, string> = {
  nis: "NIS · National Insurance Scheme",
  mps: "MPS · Public Service employment",
  gro: "GRO · Birth registration",
  passport: "Passport Office",
};

// What each portal reads, and which Citizen 360 ID it reads it by.
const REGISTRIES_FOR: Record<PortalKind, RegistryKey[]> = {
  myguyana: ["nis", "mps", "gro", "passport"],
  nis: ["nis"],
  mps: ["mps"],
  gro: ["gro"],
  passport: ["passport"],
};

type Field = { key: string; label: string; join?: string[] };

const FIELDS: Record<RegistryKey, Field[]> = {
  nis: [
    { key: "nis_number", label: "NIS number" },
    { key: "name", label: "Name", join: ["first_name", "last_name"] },
    { key: "date_of_birth", label: "Date of birth" },
    { key: "employer", label: "Employer" },
    { key: "contribution_class", label: "Contribution class" },
    { key: "contribution_weeks", label: "Weeks contributed" },
    { key: "last_contribution", label: "Last contribution" },
    { key: "registered_on", label: "Registered" },
    { key: "status", label: "Status" },
  ],
  mps: [
    { key: "eid", label: "EID" },
    { key: "name", label: "Name", join: ["first_name", "last_name"] },
    { key: "ministry", label: "Ministry" },
    { key: "job_title", label: "Job title" },
    { key: "grade", label: "Grade" },
    { key: "employment_status", label: "Status" },
    { key: "start_date", label: "Start date" },
    { key: "work_email", label: "Work email" },
    { key: "eid_issued_on", label: "EID issued" },
  ],
  gro: [
    { key: "registration_no", label: "Registration no." },
    { key: "name", label: "Name at birth", join: ["first_name", "last_name"] },
    { key: "date_of_birth", label: "Date of birth" },
    { key: "place_of_birth", label: "Place of birth" },
    { key: "district", label: "District" },
    { key: "mother_name", label: "Mother" },
    { key: "father_name", label: "Father" },
    { key: "registered_on", label: "Registered" },
  ],
  passport: [
    { key: "passport_number", label: "Passport number" },
    { key: "name", label: "Name", join: ["given_names", "surname"] },
    { key: "date_of_birth", label: "Date of birth" },
    { key: "place_of_birth", label: "Place of birth" },
    { key: "issue_date", label: "Issued" },
    { key: "expiry_date", label: "Expires" },
    { key: "status", label: "Status" },
    { key: "replaced_by", label: "Replaced by" },
  ],
};

type RegistryState =
  | { state: "loading" }
  | { state: "none"; reason: string }
  | { state: "ok"; records: RegistryRecord[] }
  | { state: "error"; message: string };

function numbersFor(registry: RegistryKey, profile: Profile): string[] {
  switch (registry) {
    case "nis":
      return profile.ids.nis ? [profile.ids.nis] : [];
    case "mps":
      return profile.ids.eid ? [profile.ids.eid] : [];
    case "gro":
      return profile.ids.gro_birth ? [profile.ids.gro_birth] : [];
    case "passport":
      // Current passport first, then superseded ones.
      return profile.identifiers
        .filter((i) => i.id_type === "PASSPORT")
        .sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1))
        .map((i) => i.id_value);
  }
}

const NO_ID_REASON: Record<RegistryKey, string> = {
  nis: "No NIS number is linked to you in Citizen 360.",
  mps: "No EID is linked to you, so there is no MPS record.",
  gro: "No GRO birth registration is linked to you in Citizen 360.",
  passport: "No passport is linked to you in Citizen 360.",
};

async function loadRegistry(registry: RegistryKey, profile: Profile): Promise<RegistryState> {
  const numbers = numbersFor(registry, profile);
  if (!numbers.length) return { state: "none", reason: NO_ID_REASON[registry] };
  const all: RegistryRecord[] = [];
  for (const n of numbers) {
    const r = await getRegistryRecords(registry, n);
    if (!r.ok) {
      if (r.status === 404) continue;
      return { state: "error", message: r.message };
    }
    all.push(...r.data.records);
  }
  return all.length ? { state: "ok", records: all } : { state: "none", reason: "The registry has no record for your ID." };
}

export function App() {
  const claims = (keycloak.tokenParsed ?? {}) as Claims;
  const cid = claims.cid ?? "";
  const [profile, setProfile] = useState<Result<Profile> | null>(null);
  const [registries, setRegistries] = useState<Partial<Record<RegistryKey, RegistryState>>>({});
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(async () => {
    setProfile(null);
    setRegistries({});
    if (!cid) {
      setProfile({ ok: false, status: 0, message: "The access token has no cid claim." });
      return;
    }
    const p = await getProfile(cid);
    setProfile(p);
    if (!p.ok) return;
    const wanted = REGISTRIES_FOR[appConfig.kind];
    setRegistries(Object.fromEntries(wanted.map((k) => [k, { state: "loading" }])));
    await Promise.all(
      wanted.map(async (k) => {
        const s = await loadRegistry(k, p.data);
        setRegistries((prev) => ({ ...prev, [k]: s }));
      }),
    );
  }, [cid]);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = () => keycloak.logout({ redirectUri: window.location.origin + "/" });
  const isHub = appConfig.kind === "myguyana";

  return (
    <div className="page">
      <header className="banner">
        <div>
          <span className="kind">{appConfig.subtitle}</span>
          <h1>{appConfig.title}</h1>
        </div>
        <span className="client-badge">client: {appConfig.clientId}</span>
      </header>

      <SessionCard claims={claims} />

      {appConfig.kind === "mps" && claims.acr !== "high" && (
        <section className="card alert" role="alert">
          <h3>High assurance missing</h3>
          <p>This token's acr is <code>{claims.acr ?? "none"}</code>. MPS Workforce expects <code>high</code>.</p>
        </section>
      )}

      {profile === null && <section className="card muted">Loading your Citizen 360 profile…</section>}

      {profile && !profile.ok && (
        <section className="card alert" role="alert">
          <h3>We couldn’t load your Citizen 360 profile</h3>
          <p>{profile.message}</p>
          <button className="btn" onClick={() => void load()}>Try again</button>
        </section>
      )}

      {profile?.ok && isHub && <Citizen360 profile={profile.data} />}

      {profile?.ok &&
        REGISTRIES_FOR[appConfig.kind].map((k) => (
          <RegistryCard key={k} registry={k} state={registries[k] ?? { state: "loading" }} compact={isHub} />
        ))}

      <PortalNav />

      <section className="card">
        <div className="row">
          <button className="btn" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? "Hide" : "Show"} token claims
          </button>
          <button className="btn" onClick={() => void load()}>Reload data</button>
          <button className="btn danger" onClick={logout}>Sign out of every portal</button>
        </div>
        {showRaw && <pre className="raw">{JSON.stringify(claims, null, 2)}</pre>}
      </section>

      <footer className="muted">
        Citizen 360 SSO POC · realm <code>{appConfig.realm}</code> · synthetic data, fictional people
      </footer>
    </div>
  );
}

function SessionCard({ claims }: { claims: Claims }) {
  const started = claims.auth_time ? new Date(claims.auth_time * 1000).toLocaleTimeString() : "—";
  const acr = claims.acr ?? "—";
  return (
    <section className="card session">
      <div className="session-head">
        <h2>Signed in with Citizen 360</h2>
        <span className={`pill ${acr === "high" ? "pill-high" : "pill-verified"}`}>assurance: {acr}</span>
      </div>
      <p className="muted">
        One account for every portal. Opening another portal reuses this session; you won’t be asked to sign in again.
      </p>
      <dl className="facts">
        <div><dt>Citizen ID (cid)</dt><dd className="mono">{claims.cid ?? "—"}</dd></div>
        <div><dt>Signed in with</dt><dd>{claims.login_id_type ? ID_LABELS[claims.login_id_type] ?? claims.login_id_type : "—"}</dd></div>
        <div><dt>Person LoA in Citizen 360</dt><dd>{claims.person_loa ?? "—"}</dd></div>
        <div><dt>Session started</dt><dd>{started}</dd></div>
      </dl>
    </section>
  );
}

function Citizen360({ profile }: { profile: Profile }) {
  return (
    <section className="card">
      <h2 className="section-title">Your Citizen 360 record</h2>
      <p className="muted">
        Every ID the government holds for you, linked to one Citizen ID. Status <code>superseded</code> means an
        old number that no longer signs you in.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID type</th><th>Value</th><th>Status</th><th>Verified</th><th>Source</th></tr>
          </thead>
          <tbody>
            {profile.identifiers.map((i) => (
              <tr key={`${i.id_type}:${i.id_value}`} className={i.status !== "active" ? "dim" : ""}>
                <td>{ID_LABELS[i.id_type] ?? i.id_type}</td>
                <td className="mono">{i.id_value}</td>
                <td><span className={`pill ${i.status === "active" ? "pill-ok" : "pill-old"}`}>{i.status}</span></td>
                <td>{i.verified}</td>
                <td>{i.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Person status <b>{profile.person.status}</b> · assurance <b>{profile.person.loa}</b> · linked from{" "}
        {profile.links.length} source records ({[...new Set(profile.links.map((l) => l.source_system))].join(", ")})
      </p>
    </section>
  );
}

function value(record: RegistryRecord, f: Field): string {
  if (f.join) return f.join.map((k) => record[k]).filter(Boolean).join(" ");
  const v = record[f.key];
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

function RegistryCard({ registry, state, compact }: { registry: RegistryKey; state: RegistryState; compact: boolean }) {
  const fields = compact ? FIELDS[registry].slice(0, 6) : FIELDS[registry];
  return (
    <section className={`card registry registry-${registry}`}>
      <h2 className="section-title">{compact ? REGISTRY_TITLES[registry] : `Your record · ${REGISTRY_TITLES[registry]}`}</h2>
      {state.state === "loading" && <p className="muted">Loading…</p>}
      {state.state === "none" && <p className="muted">{state.reason}</p>}
      {state.state === "error" && <p className="error-text" role="alert">{state.message}</p>}
      {state.state === "ok" &&
        state.records.map((rec) => (
          <div key={String(rec.id)} className="record">
            <dl className="facts">
              {fields.map((f) => (
                <div key={f.key}><dt>{f.label}</dt><dd>{value(rec, f)}</dd></div>
              ))}
            </dl>
            <p className="muted small mono">
              {registry} registry record #{String(rec.id)}
            </p>
          </div>
        ))}
    </section>
  );
}

function PortalNav() {
  const others = appConfig.links.filter((l) => l.kind !== appConfig.kind);
  if (!others.length) return null;
  return (
    <section className="card">
      <h2 className="section-title">Other government portals</h2>
      <p className="muted">These use the same sign-in. You go straight in unless a portal needs a higher assurance level.</p>
      <div className="links">
        {others.map((l) => (
          <a key={l.url} className="portal-link" href={l.url}>
            <span>{l.title}</span>
            {l.note && <span className="link-note">{l.note}</span>}
          </a>
        ))}
      </div>
    </section>
  );
}
