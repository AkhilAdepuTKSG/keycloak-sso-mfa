-- Synthetic birth registrations. All names are fictional.
-- Nadia Fairweather was registered at birth as Nadia Holloway.
INSERT INTO gro_birth
  (registration_no, first_name, last_name, date_of_birth, sex, place_of_birth, district, mother_name, father_name, registered_on)
VALUES
  ('B1984000101', 'Marisol',   'Thornbury',   '1984-03-12', 'F', 'Georgetown Public Hospital', 'Demerara-Mahaica',          'Lorna Thornbury',    'Calvin Thornbury',   '1984-03-20'),
  ('B1991000202', 'Devan',     'Rampersaud',  '1991-07-25', 'M', 'New Amsterdam Hospital',     'East Berbice-Corentyne',    'Savitri Rampersaud', 'Harold Rampersaud',  '1991-08-02'),
  ('B1978000303', 'Celestine', 'Abernathy',   '1978-11-02', 'F', 'Linden Hospital Complex',    'Upper Demerara-Berbice',    'Grace Abernathy',    'Milton Abernathy',   '1978-11-10'),
  ('B1980000404', 'Joel',      'Fairweather', '1980-05-30', 'M', 'Suddie Hospital',            'Pomeroon-Supenaam',         'Ivy Fairweather',    'Neville Fairweather','1980-06-06'),
  ('B1982000505', 'Nadia',     'Holloway',    '1982-09-14', 'F', 'Bartica Hospital',           'Cuyuni-Mazaruni',           'Beryl Holloway',     'Desmond Holloway',   '1982-09-21'),
  ('B1975000606', 'Rohan',     'Castellano',  '1975-01-08', 'M', 'Port Mourant Hospital',      'East Berbice-Corentyne',    'Rita Castellano',    'Felix Castellano',   '1975-01-15'),
  ('B1993000707', 'Tamsin',    'Ogilvie',     '1993-04-19', 'F', 'Mahaicony Cottage Hospital', 'Mahaica-Berbice',           'Paula Ogilvie',      'Arthur Ogilvie',     '1993-04-27'),
  ('B1969000808', 'Ezekiel',   'Marchetti',   '1969-12-01', 'M', 'Lethem Regional Hospital',   'Upper Takutu-Upper Essequibo','Ana Marchetti',     'Bruno Marchetti',    '1969-12-09');
