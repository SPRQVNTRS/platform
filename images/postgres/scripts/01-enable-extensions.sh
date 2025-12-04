#!/bin/bash
set -e

# Install pg_cron extension into `postgres` database

# Wait for PostgreSQL to start
until pg_isready; do
  echo "Waiting for PostgreSQL to start..."
  sleep 1
done

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pg_cron;
EOSQL

echo "PostgreSQL configured with pg_cron extension" 