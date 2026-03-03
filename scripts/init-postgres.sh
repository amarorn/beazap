#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER beazap WITH PASSWORD 'beazap';
  CREATE DATABASE beazap OWNER beazap;
  GRANT ALL PRIVILEGES ON DATABASE beazap TO beazap;
EOSQL
