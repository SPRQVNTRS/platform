#!/usr/bin/env bash
#
# Configure npm Trusted Publishing (OIDC) for the five public @sprqvntrs
# packages, driven from a sandbox that cannot open a browser.
#
# Why this exists:
#   - `npm trust` requires a *web* npm login session. It rejects the
#     classic-token / automation-token auth this workspace normally uses
#     for CI (bypass-2FA tokens are refused outright).
#   - The operator must approve the login (and any follow-on 2FA
#     challenge npm prints while granting trust) in their own browser.
#   - This shell has no browser to open, so we force npm to *print* the
#     login/2FA URL instead of trying to launch one, and keep stdout
#     unredirected so the operator can see and open every URL.
#
# Run this from any shell with a terminal (this sandbox included) and
# open the printed URLs in your own browser to approve with 2FA.
#
# This script is intentionally NOT run automatically — read it, then run
# it by hand: bash platform/scripts/configure-trusted-publishers.sh

set -euo pipefail

PACKAGES=(llm workflows helpers logger bot-verify)
REPO="SPRQVNTRS/platform"
WORKFLOW="release.yml"
REGISTRY="https://registry.npmjs.org"

tmp="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp"
}
trap cleanup EXIT

# Isolate npm's config entirely from this machine's normal npmrc/tokens —
# no leaked scope->registry mapping, no leaked auth token.
export NPM_CONFIG_USERCONFIG="$tmp/npmrc"
cat >"$NPM_CONFIG_USERCONFIG" <<'EOF'
@sprqvntrs:registry=https://registry.npmjs.org
EOF

# `npm login --auth-type=web` still tries to exec a browser opener by
# default; there is no `--no-browser` flag (checked via `npm login
# --help`), so instead point the "browser" opener at `echo` — npm then
# just prints the URL to stdout instead of trying (and failing) to open
# a real browser.
export BROWSER=echo

# Never let ambient auth tokens sneak into a supposedly clean web login.
unset NODE_AUTH_TOKEN NPM_TOKEN NPM_CONFIG__AUTH NPMJS_SPRQVNTRS_TOKEN

# Pin to npm >= 11.15 regardless of what the toolbox ships (`npm trust`
# needs 11.15+; the ts-dev toolbox currently carries npm 10).
NPM=(npx --yes npm@12)

echo "Using: $("${NPM[@]}" --version)"

failures=()

echo
echo "=================================================================="
echo " STEP 1: WEB LOGIN"
echo "=================================================================="
echo " OPEN THE URL BELOW IN YOUR BROWSER AND APPROVE WITH 2FA"
echo "=================================================================="
echo

"${NPM[@]}" login --registry "$REGISTRY" --auth-type=web

echo
echo "Logged in as:"
"${NPM[@]}" whoami --registry "$REGISTRY"

echo
echo "=================================================================="
echo " STEP 2: GRANT TRUSTED PUBLISHING PER PACKAGE"
echo "=================================================================="

for p in "${PACKAGES[@]}"; do
  echo
  echo "------------------------------------------------------------------"
  echo " @sprqvntrs/$p  <-  github:$REPO ($WORKFLOW)"
  echo " If npm prints another URL here, it is a 2FA challenge for this"
  echo " grant — open it and approve in your browser."
  echo "------------------------------------------------------------------"
  if ! "${NPM[@]}" trust github "@sprqvntrs/$p" \
      --repo "$REPO" \
      --file "$WORKFLOW" \
      --allow-publish \
      --yes \
      --registry "$REGISTRY" \
      --auth-type=web; then
    echo "FAILED: @sprqvntrs/$p" >&2
    failures+=("$p")
  fi
done

echo
echo "=================================================================="
echo " STEP 3: SHOW CONFIGURED TRUSTED PUBLISHERS"
echo "=================================================================="

for p in "${PACKAGES[@]}"; do
  echo
  echo "------------------------------------------------------------------"
  echo " @sprqvntrs/$p"
  echo "------------------------------------------------------------------"
  "${NPM[@]}" trust list "@sprqvntrs/$p" --registry "$REGISTRY" || true
done

echo
echo "=================================================================="
echo " STEP 4: LOG OUT (revoke the web-login session token)"
echo "=================================================================="

"${NPM[@]}" logout --registry "$REGISTRY" || true

if [ "${#failures[@]}" -gt 0 ]; then
  echo
  echo "Trust configuration FAILED for: ${failures[*]}" >&2
  exit 1
fi

echo
echo "All packages configured."
