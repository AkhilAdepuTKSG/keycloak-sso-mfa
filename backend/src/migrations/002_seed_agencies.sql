INSERT INTO agencies (code, name) VALUES
  ('MPS', 'Ministry of Public Service'),
  ('MOH', 'Ministry of Health'),
  ('MOF', 'Ministry of Finance'),
  ('MOA', 'Ministry of Agriculture'),
  ('MOE', 'Ministry of Education'),
  ('REG4', 'Region 4')
ON CONFLICT (code) DO NOTHING;
