#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

# Function to check if a role exists
role_exists() {
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_roles WHERE rolname='$1'" | grep -q 1
}

# Function to check if a database exists
database_exists() {
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='$1'" | grep -q 1
}

# --- Delphi User and Database ---
echo "Checking/Creating Delphi role and database..."
set -x # Enable command tracing
role_exists "delphi"
exit_status=$?
set +x # Disable command tracing

if [ $exit_status -eq 0 ]; then
  echo "Role 'delphi' already exists."
else
  echo "Creating role 'delphi'..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
      CREATE ROLE delphi WITH LOGIN PASSWORD '${DELPHI_DB_PASSWORD:-password}';
      ALTER ROLE delphi WITH SUPERUSER; -- Or grant specific privileges needed
EOSQL
  echo "Role 'delphi' created."
fi

set -x # Enable command tracing
database_exists "delphi"
exit_status=$?
set +x # Disable command tracing

if [ $exit_status -eq 0 ]; then
  echo "Database 'delphi' already exists."
else
  echo "Creating database 'delphi'..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
      CREATE DATABASE delphi OWNER delphi;
      GRANT CREATE ON DATABASE delphi TO delphi;
      GRANT CREATE ON SCHEMA public TO delphi; -- Grant create on public schema within delphi DB
EOSQL
  echo "Database 'delphi' created and privileges granted."
fi


# --- Daedalus User and Database ---
echo "Checking/Creating Daedalus role and database..."
set -x # Enable command tracing
role_exists "daedalus"
exit_status=$?
set +x # Disable command tracing

if [ $exit_status -eq 0 ]; then
  echo "Role 'daedalus' already exists."
else
  echo "Creating role 'daedalus'..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
      CREATE ROLE daedalus WITH LOGIN PASSWORD '${DAEDALUS_DB_PASSWORD:-password}';
      ALTER ROLE daedalus WITH SUPERUSER; -- Or grant specific privileges needed
EOSQL
  echo "Role 'daedalus' created."
fi

set -x # Enable command tracing
database_exists "daedalus"
exit_status=$?
set +x # Disable command tracing

if [ $exit_status -eq 0 ]; then
  echo "Database 'daedalus' already exists."
else
  echo "Creating database 'daedalus'..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
      CREATE DATABASE daedalus OWNER daedalus;
      GRANT CREATE ON DATABASE daedalus TO daedalus;
      GRANT CREATE ON SCHEMA public TO daedalus; -- Grant create on public schema within daedalus DB
EOSQL
  echo "Database 'daedalus' created and privileges granted."
fi

echo "Database and role setup checks complete." 