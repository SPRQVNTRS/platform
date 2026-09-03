# Postgres Container for Delphi

Installs:

- PG_Vector
- PG CRON

- Adds a custom config from `config/postgresql.conf` but only when the volume of postgres is built for the first time. If this is used for an existing volume, the new config will have to be manually copied, then the postgres server needs to be restarted

## Initializing the extensions

- The `01-init-extensions.sh` script is copied into the container in `Dockerfile.postgres` to be applied on the **very first run only**.
- For a running system, this will have to be applied manually

## Build

- Done automatically via GH Actions

Thu Dec  4 02:55:22 PM CET 2025

## Publishing

The release workflow rebuilds and pushes this image only when the triggering commit changes a file under `images/postgres/`. Bump `version` in `package.json` and add a CHANGELOG entry in the same commit, so the pushed tag matches.
