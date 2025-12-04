ARG PG_MAJOR=17
ARG PGVECTOR_VERSION=v0.8.0
ARG PG_CRON_VERSION=v1.6.4

FROM postgres:$PG_MAJOR AS builder
ARG PG_MAJOR
ARG PGVECTOR_VERSION
ARG PG_CRON_VERSION

# Install build dependencies
RUN apt-get update && \
		apt-mark hold locales && \
		apt-get install -y --no-install-recommends \
		build-essential \
		postgresql-server-dev-$PG_MAJOR \
		git \
		ca-certificates \
		wget

# Ensure pg_config is in the PATH
ENV PATH="/usr/lib/postgresql/$PG_MAJOR/bin:${PATH}"

# Build and install pgvector
RUN wget -O /tmp/pgvector.tar.gz https://github.com/pgvector/pgvector/archive/refs/tags/${PGVECTOR_VERSION}.tar.gz && \
		mkdir -p /tmp/pgvector && \
		tar -xzf /tmp/pgvector.tar.gz -C /tmp/pgvector --strip-components=1 && \
		cd /tmp/pgvector && \
		make clean && \
		make OPTFLAGS="" && \
		make install

# Build and install pg_cron
RUN wget -O /tmp/pg_cron.tar.gz https://github.com/citusdata/pg_cron/archive/refs/tags/${PG_CRON_VERSION}.tar.gz && \
		mkdir -p /tmp/pg_cron && \
		tar -xzf /tmp/pg_cron.tar.gz -C /tmp/pg_cron --strip-components=1 && \
		cd /tmp/pg_cron && \
		make && \
		make install

# Final image
FROM postgres:$PG_MAJOR
ARG PG_MAJOR

# Copy our custom, pre-configured postgresql.conf over the default sample
# This ensures our settings (like shared_preload_libraries) are used during initdb
COPY config/postgresql.conf /usr/share/postgresql/$PG_MAJOR/postgresql.conf.sample
RUN chown postgres:postgres /usr/share/postgresql/$PG_MAJOR/postgresql.conf.sample

COPY scripts/ensure-dbs.sh /docker-entrypoint-initdb.d/ensure-dbs.sh
RUN chmod +x /docker-entrypoint-initdb.d/ensure-dbs.sh

# Copy compiled extensions from builder
COPY --from=builder /usr/lib/postgresql/$PG_MAJOR/lib/vector.so /usr/lib/postgresql/$PG_MAJOR/lib/
COPY --from=builder /usr/share/postgresql/$PG_MAJOR/extension/vector* /usr/share/postgresql/$PG_MAJOR/extension/
COPY --from=builder /usr/lib/postgresql/$PG_MAJOR/lib/pg_cron.so /usr/lib/postgresql/$PG_MAJOR/lib/
COPY --from=builder /usr/share/postgresql/$PG_MAJOR/extension/pg_cron* /usr/share/postgresql/$PG_MAJOR/extension/

# Add documentation
RUN mkdir -p /usr/share/doc/pgvector /usr/share/doc/pg_cron

# Copy extension READMEs and LICENSE files if needed
COPY --from=builder /tmp/pgvector/LICENSE /tmp/pgvector/README.md /usr/share/doc/pgvector/
COPY --from=builder /tmp/pg_cron/LICENSE /tmp/pg_cron/README.md /usr/share/doc/pg_cron/

# Create a custom entrypoint to ensure configurations are applied on first run
COPY scripts/01-enable-extensions.sh /docker-entrypoint-initdb.d/01-enable-extensions.sh
RUN chmod +x /docker-entrypoint-initdb.d/01-enable-extensions.sh

# Clean up
RUN apt-get update && \
		apt-get clean && \
		rm -rf /var/lib/apt/lists/*

