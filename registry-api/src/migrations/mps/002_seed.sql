-- Synthetic MPS employees. All names are fictional. Only these two people hold an EID.
INSERT INTO mps_employee
  (eid, nis_number, national_id, first_name, last_name, date_of_birth, ministry, job_title, grade, employment_status, start_date, work_email, eid_issued_on)
VALUES
  ('EID10000001', '4000001', '100000001', 'Marisol', 'Thornbury',   '1984-03-12', 'Ministry of Public Service', 'Senior Human Resources Officer', 'GS-9', 'ACTIVE', '2012-09-03', 'm.thornbury@mps.example.org', '2024-02-15'),
  ('EID10000004', '4000004', '100000004', 'Joel',    'Fairweather', '1980-05-30', 'Ministry of Education',      'Education Officer',              'GS-7', 'ACTIVE', '2006-01-09', 'j.fairweather@moe.example.org', '2024-06-01');
