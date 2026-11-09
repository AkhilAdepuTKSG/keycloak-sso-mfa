-- Synthetic scholarship applications. All people and institutions are fictional.
-- Nadia applied with the family email she shares with Joel, so that email can't sign her in.
-- Kezia Brathwaite self-registered with an email only: no registry match, Basic assurance.
INSERT INTO scholarship_application
  (application_no, national_id, applicant_email, first_name, last_name, date_of_birth, programme, institution, country, study_level, academic_year, status, award, submitted_on, decision_on)
VALUES
  ('SCH2026000101', '100000002', 'devan.rampersaud@example.org',   'Devan',  'Rampersaud', '1991-07-25', 'MSc Supply Chain Management',        'Demerara Institute of Technology',  'Guyana',   'Postgraduate',  '2026/27', 'AWARDED',      'Full tuition and monthly stipend', '2026-03-14', '2026-07-01'),
  ('SCH2026000102', '100000005', 'fairweather.family@example.org', 'Nadia',  'Fairweather','1982-09-14', 'BSc Pharmacy',                       'Essequibo College of Health Sciences', 'Guyana', 'Undergraduate', '2026/27', 'UNDER_REVIEW', NULL,                               '2026-09-02', NULL),
  ('SCH2025000087', '100000007', 'tamsin.ogilvie@example.org',     'Tamsin', 'Ogilvie',    '1993-04-19', 'Diploma in Agricultural Engineering','Berbice Polytechnic',               'Guyana',   'Diploma',       '2025/26', 'AWARDED',      'Full tuition',                     '2025-02-20', '2025-06-12'),
  ('SCH2026000140', NULL,        'kezia.brathwaite@example.org',   'Kezia',  'Brathwaite', '2006-02-11', 'BSc Computer Science',               'Rupununi University (fictional)',   'Guyana',   'Undergraduate', '2026/27', 'SUBMITTED',    NULL,                               '2026-10-05', NULL);
