-- MPS Scholarships: citizen-facing scholarship applications.
-- Applicants may self-register with just an email address, so national_id is optional.
CREATE TABLE scholarship_application (
  id               SERIAL PRIMARY KEY,
  application_no   TEXT NOT NULL UNIQUE,   -- SCH + year + 6 digits
  national_id      TEXT,                   -- cross-reference key when the applicant gave one
  applicant_email  TEXT NOT NULL,          -- contact; may be shared by a family
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  date_of_birth    DATE,
  programme        TEXT NOT NULL,
  institution      TEXT NOT NULL,
  country          TEXT NOT NULL,
  study_level      TEXT NOT NULL,
  academic_year    TEXT NOT NULL,
  status           TEXT NOT NULL,          -- SUBMITTED, UNDER_REVIEW, AWARDED, DECLINED
  award            TEXT,
  submitted_on     DATE NOT NULL,
  decision_on      DATE
);
CREATE INDEX scholarship_application_email ON scholarship_application (applicant_email);
