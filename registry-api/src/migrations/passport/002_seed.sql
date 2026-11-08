-- Synthetic passports. All names are fictional.
-- Celestine Abernathy renewed in 2022: R1000003 is REPLACED by R1000033, so in
-- Citizen 360 the old number is "superseded" and no longer logs in.
INSERT INTO passport_record
  (passport_number, national_id, gro_birth_no, surname, given_names, date_of_birth, sex, place_of_birth, issue_date, expiry_date, status, replaced_by)
VALUES
  ('R1000001', '100000001', 'B1984000101', 'THORNBURY',   'MARISOL',   '1984-03-12', 'F', 'Georgetown',    '2021-06-01', '2031-05-31', 'VALID',    NULL),
  ('R1000002', '100000002', 'B1991000202', 'RAMPERSAUD',  'DEVAN',     '1991-07-25', 'M', 'New Amsterdam', '2019-09-10', '2029-09-09', 'VALID',    NULL),
  ('R1000003', '100000003', 'B1978000303', 'ABERNATHY',   'CELESTINE', '1978-11-02', 'F', 'Linden',        '2012-02-14', '2022-02-13', 'REPLACED', 'R1000033'),
  ('R1000033', '100000003', 'B1978000303', 'ABERNATHY',   'CELESTINE', '1978-11-02', 'F', 'Linden',        '2022-02-20', '2032-02-19', 'VALID',    NULL),
  ('R1000004', '100000004', 'B1980000404', 'FAIRWEATHER', 'JOEL',      '1980-05-30', 'M', 'Anna Regina',   '2023-03-01', '2033-02-28', 'VALID',    NULL),
  ('R1000006', '100000006', 'B1975000606', 'CASTELLANO',  'ROHAN',     '1975-01-08', 'M', 'Rose Hall',     '2018-07-07', '2028-07-06', 'VALID',    NULL),
  ('R1000008', '100000008', 'B1969000808', 'MARCHETTI',   'EZEKIEL',   '1969-12-01', 'M', 'Lethem',        '2020-01-20', '2030-01-19', 'VALID',    NULL);
