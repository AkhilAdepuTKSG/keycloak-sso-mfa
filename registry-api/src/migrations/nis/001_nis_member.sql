-- NIS registry: members of the National Insurance Scheme.
-- nis_number is NOT unique: legacy data holds a duplicate (see 002_seed.sql).
CREATE TABLE nis_member (
  id                  SERIAL PRIMARY KEY,
  nis_number          TEXT NOT NULL,          -- 7 digits, the NIS portal's login ID
  national_id         TEXT,                   -- cross-reference key (GECOM)
  gro_birth_no        TEXT,                   -- cross-reference key (GRO birth certificate)
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  date_of_birth       DATE NOT NULL,
  sex                 CHAR(1),
  email               TEXT,                   -- contact on file; may be shared by a family
  employer            TEXT,
  contribution_class  TEXT,
  registered_on       DATE,
  contribution_weeks  INTEGER NOT NULL DEFAULT 0,
  last_contribution   DATE,
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
);
CREATE INDEX nis_member_nis_number ON nis_member (nis_number);
