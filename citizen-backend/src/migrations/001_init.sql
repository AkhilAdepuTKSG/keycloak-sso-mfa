CREATE SEQUENCE IF NOT EXISTS nis_seq START 100001;

CREATE TABLE IF NOT EXISTS nis_members (
  sub          TEXT PRIMARY KEY,
  nis_number   TEXT UNIQUE NOT NULL,
  email        TEXT,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS citizen_audit_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_sub      TEXT NOT NULL,
  actor_email    TEXT,
  action         TEXT NOT NULL,
  resource_type  TEXT NOT NULL,
  resource_ref   TEXT,
  result         TEXT NOT NULL,
  ip             TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
