#!/bin/bash
# ============================================================================
# with-root-env.sh — Load the nearest .env file walking up from CWD, then exec
#
# Walks up the directory tree from the current working directory looking for a
# .env file. When found, exports all KEY=VALUE pairs (skipping comments and
# blank lines) into the environment, then execs the remaining arguments.
#
# This lets the monorepo keep a single .env at the repo root (e.g. hq/.env)
# that sub-projects like apps/web can use without duplicating env files.
#
# Usage (in package.json scripts):
#   "dev": "../../scripts/with-root-env.sh next dev -p 3000"
#   "build": "../../scripts/with-root-env.sh next build"
# ============================================================================

set -euo pipefail

find_env_file() {
  local dir="$1"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/.env" ]; then
      echo "$dir/.env"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

ENV_FILE=$(find_env_file "$(pwd)") || true

if [ -n "$ENV_FILE" ]; then
  # Export each KEY=VALUE line, skipping comments and blank lines.
  # Only set vars that aren't already in the environment (don't override).
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip blank lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Trim leading/trailing whitespace
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    # Extract key
    key="${line%%=*}"
    # Only export if not already set in environment
    if [ -z "${!key+x}" ]; then
      export "$line"
    fi
  done < "$ENV_FILE"
fi

exec "$@"
