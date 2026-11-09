-- One PostgreSQL server, one database per registry: each registry service only
-- ever connects to its own database.
CREATE DATABASE nis_registry;
CREATE DATABASE mps_registry;
CREATE DATABASE gro_registry;
CREATE DATABASE passport_registry;
CREATE DATABASE scholarships_registry;
