CREATE TABLE IF NOT EXISTS agencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS req_seq START 1001;

CREATE TABLE IF NOT EXISTS employment_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         TEXT UNIQUE NOT NULL,
  position_title    TEXT NOT NULL,
  origin_agency     TEXT NOT NULL,
  handling_agency   TEXT NOT NULL DEFAULT 'MPS',
  status            TEXT NOT NULL,
  created_by_sub    TEXT NOT NULL,
  created_by_email  TEXT,
  assigned_to_sub   TEXT,
  assigned_to_email TEXT,
  details           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_transitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES employment_requests(id) ON DELETE CASCADE,
  from_status      TEXT,
  to_status        TEXT NOT NULL,
  action           TEXT NOT NULL,
  actor_sub        TEXT NOT NULL,
  actor_email      TEXT,
  effective_role   TEXT NOT NULL,
  delegated_by_sub TEXT,
  delegation_id    UUID,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS minutes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   UUID NOT NULL REFERENCES employment_requests(id) ON DELETE CASCADE,
  document     JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delegations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_sub   TEXT NOT NULL,
  delegator_email TEXT,
  delegate_sub    TEXT NOT NULL,
  delegate_email  TEXT,
  delegated_role  TEXT NOT NULL,
  scope           TEXT NOT NULL,
  ministry        TEXT NOT NULL,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by_sub  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by_sub  TEXT,
  revoked_at      TIMESTAMPTZ,
  CONSTRAINT valid_window CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_deleg_active ON delegations (delegate_sub, ministry, scope, status);

CREATE TABLE IF NOT EXISTS audit_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_sub        TEXT NOT NULL,
  actor_email      TEXT,
  actor_agency     TEXT,
  action           TEXT NOT NULL,
  resource_type    TEXT NOT NULL,
  resource_ref     TEXT,
  effective_role   TEXT,
  delegated        BOOLEAN NOT NULL DEFAULT false,
  delegated_by_sub TEXT,
  delegation_id    UUID,
  result           TEXT NOT NULL,
  ip               TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events (created_at DESC);
