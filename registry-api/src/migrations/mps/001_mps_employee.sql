-- MPS registry: public service employees and the EIDs issued to them.
CREATE TABLE mps_employee (
  id                 SERIAL PRIMARY KEY,
  eid                TEXT NOT NULL UNIQUE,   -- EID + 8 digits, the MPS Workforce login ID
  nis_number         TEXT,                   -- cross-reference
  national_id        TEXT,                   -- cross-reference key (GECOM)
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  date_of_birth      DATE NOT NULL,
  ministry           TEXT NOT NULL,
  job_title          TEXT NOT NULL,
  grade              TEXT,
  employment_status  TEXT NOT NULL DEFAULT 'ACTIVE',
  start_date         DATE,
  work_email         TEXT,
  eid_issued_on      DATE
);
