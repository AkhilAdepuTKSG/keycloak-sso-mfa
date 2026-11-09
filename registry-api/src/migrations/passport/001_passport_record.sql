-- Passport registry: every passport issued, including replaced ones.
CREATE TABLE passport_record (
  id               SERIAL PRIMARY KEY,
  passport_number  TEXT NOT NULL UNIQUE,   -- R + 7 digits, the Passport portal's login ID
  national_id      TEXT,                   -- cross-reference key (GECOM)
  gro_birth_no     TEXT,                   -- cross-reference key (GRO birth certificate)
  surname          TEXT NOT NULL,
  given_names      TEXT NOT NULL,
  date_of_birth    DATE NOT NULL,
  sex              CHAR(1),
  place_of_birth   TEXT,
  issue_date       DATE NOT NULL,
  expiry_date      DATE NOT NULL,
  status           TEXT NOT NULL,          -- VALID, REPLACED, EXPIRED
  replaced_by      TEXT                    -- passport_number of the renewal
);
