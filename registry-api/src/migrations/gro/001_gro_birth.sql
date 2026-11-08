-- GRO registry: birth registrations. Names are as registered at birth, so a married
-- person's surname here can differ from other registries. Linking uses the
-- registration number (carried by NIS and passport records), not names.
CREATE TABLE gro_birth (
  id               SERIAL PRIMARY KEY,
  registration_no  TEXT NOT NULL UNIQUE,   -- B + year + 6 digits
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  date_of_birth    DATE NOT NULL,
  sex              CHAR(1),
  place_of_birth   TEXT,
  district         TEXT,
  mother_name      TEXT,
  father_name      TEXT,
  registered_on    DATE
);
