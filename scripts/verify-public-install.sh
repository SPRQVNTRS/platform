#!/usr/bin/env bash
#
# Clean-room, tokenless install check for the five public @sprqvntrs packages.
#
# Proves that a person with no GitHub token, in an empty directory outside this
# workspace, can install every package from npmjs.com and reach its entry FILE
# on disk. The packages ship raw TypeScript (main: ./index.ts), so fetching the
# tarball is not enough: index.ts must actually be there.
#
# The script does not trust its caller. It unsets the auth env vars itself and
# points npm at an empty user config, so no inherited .npmrc can supply a scope
# mapping or a token and make the check pass for the wrong reason.
#
# Usage:
#   bash scripts/verify-public-install.sh                 # install + assert
#   bash scripts/verify-public-install.sh --print-entries # also print entry paths

set -euo pipefail

PACKAGES=(llm workflows helpers logger bot-verify)
REGISTRY="https://registry.npmjs.org"

PRINT_ENTRIES=0
if [[ "${1:-}" == "--print-entries" ]]; then
  PRINT_ENTRIES=1
fi

# Never inherit publish/read credentials from the caller.
unset NODE_AUTH_TOKEN
unset GITHUB_PACKAGES_TOKEN
unset GITHUB_TOKEN
unset NPM_TOKEN

# mktemp -d must land somewhere both the host and the ts-dev toolbox can see.
: "${TMPDIR:=/tmp}"
export TMPDIR
WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

case "$WORKDIR" in
  */workspace-sprqvntrs/*)
    echo "FAIL: temp dir $WORKDIR is inside the workspace; the repo .npmrc would leak in" >&2
    exit 1
    ;;
esac

# An empty user config: no scope mapping, no token, no registry override.
: > "$WORKDIR/npmrc"
export NPM_CONFIG_USERCONFIG="$WORKDIR/npmrc"

cat > "$WORKDIR/package.json" <<'JSON'
{
  "name": "sprqvntrs-public-install-check",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "@sprqvntrs/llm": "*",
    "@sprqvntrs/workflows": "*",
    "@sprqvntrs/helpers": "*",
    "@sprqvntrs/logger": "*",
    "@sprqvntrs/bot-verify": "*"
  }
}
JSON

echo "clean room: $WORKDIR"
echo "registry:   $REGISTRY (no token)"
echo

# npm, deliberately, not pnpm: a warm pnpm store would satisfy the install from
# cache and hide a registry or permission failure.
if ! (cd "$WORKDIR" && npm install --registry "$REGISTRY" --no-audit --no-fund >"$WORKDIR/install.log" 2>&1); then
  echo "FAIL: tokenless npm install failed" >&2
  tail -n 30 "$WORKDIR/install.log" >&2
  exit 1
fi
echo "ok   npm install (tokenless)"
echo

FAILURES=0
for name in "${PACKAGES[@]}"; do
  dir="$WORKDIR/node_modules/@sprqvntrs/$name"
  problems=()

  if [[ ! -f "$dir/package.json" ]]; then
    echo "FAIL @sprqvntrs/$name: not installed"
    FAILURES=$((FAILURES + 1))
    continue
  fi

  version="$(node -p "require('$dir/package.json').version")"
  license="$(node -p "require('$dir/package.json').license || ''")"
  main="$(node -p "require('$dir/package.json').main || ''")"

  [[ "$license" == "MIT" ]] || problems+=("license is '$license', expected MIT")
  [[ -f "$dir/LICENSE" ]] || problems+=("LICENSE file missing")

  if [[ -z "$main" ]]; then
    problems+=("no main field")
    entry=""
  else
    entry="$dir/${main#./}"
    [[ -f "$entry" ]] || problems+=("entry file $main missing on disk")
  fi

  if [[ ${#problems[@]} -eq 0 ]]; then
    echo "ok   @sprqvntrs/$name@$version  MIT  LICENSE  $main"
    if [[ $PRINT_ENTRIES -eq 1 ]]; then
      echo "     entry: $entry"
    fi
  else
    for problem in "${problems[@]}"; do
      echo "FAIL @sprqvntrs/$name@$version: $problem"
    done
    FAILURES=$((FAILURES + 1))
  fi
done

echo
if [[ $FAILURES -ne 0 ]]; then
  echo "$FAILURES of ${#PACKAGES[@]} packages failed the clean-room check" >&2
  exit 1
fi
echo "all ${#PACKAGES[@]} packages install and resolve without a token"
