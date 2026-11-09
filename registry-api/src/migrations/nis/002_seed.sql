-- Synthetic NIS members. All names are fictional.
-- Row 6 and row 7 share NIS number 4000099: a legacy data-entry error. The two rows
-- carry different national IDs, so the loader links them to two different people,
-- which is the deliberate "one ID, two active owners" conflict.
INSERT INTO nis_member
  (nis_number, national_id, gro_birth_no, first_name, last_name, date_of_birth, sex, email, employer, contribution_class, registered_on, contribution_weeks, last_contribution, status)
VALUES
  ('4000001', '100000001', 'B1984000101', 'Marisol',  'Thornbury',   '1984-03-12', 'F', NULL,                              'Ministry of Public Service',       'Class 1', '2002-05-10', 1104, '2026-10-31', 'ACTIVE'),
  ('4000002', '100000002', 'B1991000202', 'Devan',    'Rampersaud',  '1991-07-25', 'M', NULL,                              'Demerara Riverside Shipping Ltd',  'Class 1', '2010-01-18',  812, '2026-10-31', 'ACTIVE'),
  ('4000003', '100000003', 'B1978000303', 'Celestine','Abernathy',   '1978-11-02', 'F', NULL,                              'Self-employed (catering)',         'Class 2', '1997-03-03', 1290, '2026-09-30', 'ACTIVE'),
  ('4000004', '100000004', 'B1980000404', 'Joel',     'Fairweather', '1980-05-30', 'M', 'fairweather.family@example.org',  'Ministry of Education',            'Class 1', '1999-08-16', 1350, '2026-10-31', 'ACTIVE'),
  ('4000005', '100000005', 'B1982000505', 'Nadia',    'Fairweather', '1982-09-14', 'F', 'fairweather.family@example.org',  'Essequibo Coast Pharmacy',         'Class 1', '2001-02-05', 1201, '2026-10-31', 'ACTIVE'),
  ('4000099', '100000006', 'B1975000606', 'Rohan',    'Castellano',  '1975-01-08', 'M', NULL,                              'Berbice Sugar Estates (fictional)', 'Class 1', '1994-06-20', 1480, '2026-10-31', 'ACTIVE'),
  ('4000099', '100000007', 'B1993000707', 'Tamsin',   'Ogilvie',     '1993-04-19', 'F', NULL,                              'Mahaicony Rice Mill',              'Class 1', '2012-11-12',  640, '2026-10-31', 'ACTIVE'),
  ('4000008', '100000008', 'B1969000808', 'Ezekiel',  'Marchetti',   '1969-12-01', 'M', NULL,                              'Lethem Cattle Co-op',              'Class 2', '1988-04-04', 1802, '2026-08-31', 'ACTIVE');
