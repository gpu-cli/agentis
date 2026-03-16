#!/bin/bash
set -euo pipefail

# ============================================================================
# Build @agentis/local — Standalone bundle
#
# Produces a self-contained Next.js standalone server in
# packages/local-runner/bundle/ that can be run with just Node.js.
#
# The standalone output preserves the monorepo directory layout because
# Next.js resolves modules relative to outputFileTracingRoot (repo root).
# The entry point is bundle/apps/web/server.js and must be run with
# CWD set to bundle/ (the CLI handles this automatically).
#
# Usage:
#   ./scripts/build-local.sh          # Build the bundle
#   ./scripts/build-local.sh --clean  # Clean and rebuild
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
BUNDLE_DIR="$ROOT_DIR/packages/local-runner/bundle"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------

if [[ "${1:-}" == "--clean" ]]; then
  echo -e "${YELLOW}Cleaning previous bundle...${NC}"
  rm -rf "$BUNDLE_DIR"
  rm -rf "$WEB_DIR/.next"
fi

# ---------------------------------------------------------------------------
# Step 1: Build the web app (turbo resolves package deps automatically)
# ---------------------------------------------------------------------------

echo -e "${CYAN}[1/6] Building web app (standalone)...${NC}"
cd "$ROOT_DIR"

# Build only @multiverse/web — NOT @agentis/local (avoids infinite recursion).
AGENTIS_LOCAL_MODE=true \
NEXT_PUBLIC_AGENTIS_LOCAL=true \
NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT=true \
pnpm turbo run build --filter=@multiverse/web --force

# ---------------------------------------------------------------------------
# Step 2: Verify standalone output exists
# ---------------------------------------------------------------------------

STANDALONE_DIR="$WEB_DIR/.next/standalone"
STANDALONE_SERVER="$STANDALONE_DIR/apps/web/server.js"

if [ ! -f "$STANDALONE_SERVER" ]; then
  echo "ERROR: Standalone server not found at $STANDALONE_SERVER"
  echo "Make sure next.config.ts has output: 'standalone' (not 'export')"
  exit 1
fi

echo -e "${CYAN}[2/6] Standalone server found${NC}"

# ---------------------------------------------------------------------------
# Step 3: Copy static assets into standalone (Next.js doesn't include them)
# ---------------------------------------------------------------------------

echo -e "${CYAN}[3/6] Copying static assets...${NC}"

STANDALONE_WEB="$STANDALONE_DIR/apps/web"

# public/ — sprites, demos, favicons
cp -r "$WEB_DIR/public" "$STANDALONE_WEB/public"

# .next/static/ — compiled JS/CSS chunks
mkdir -p "$STANDALONE_WEB/.next"
cp -r "$WEB_DIR/.next/static" "$STANDALONE_WEB/.next/static"

# ---------------------------------------------------------------------------
# Step 4: Hoist pnpm virtual store into flat node_modules
#
# pnpm standalone output uses .pnpm/ virtual store but Node.js can't
# resolve packages like 'styled-jsx' without top-level symlinks.
# We create real copies (not symlinks) for portability.
# ---------------------------------------------------------------------------

echo -e "${CYAN}[4/6] Hoisting pnpm dependencies...${NC}"

PNPM_STORE="$STANDALONE_DIR/node_modules/.pnpm"
ROOT_NM="$STANDALONE_DIR/node_modules"

if [ -d "$PNPM_STORE" ]; then
  # For each package version dir in .pnpm/, hoist its node_modules entries.
  # pnpm creates symlinks in node_modules/ pointing into .pnpm/ — we replace
  # those symlinks with real copies so the bundle is self-contained.
  for pkg_dir in "$PNPM_STORE"/*/node_modules/*; do
    [ -d "$pkg_dir" ] || continue
    pkg_name=$(basename "$pkg_dir")

    # Handle scoped packages (@img, @next, @swc, etc.)
    parent_dir=$(dirname "$pkg_dir")
    grandparent=$(basename "$(dirname "$parent_dir")")
    if [[ "$grandparent" == "node_modules" ]]; then
      scope_dir=$(basename "$(dirname "$pkg_dir")")
      if [[ "$scope_dir" == @* ]]; then
        mkdir -p "$ROOT_NM/$scope_dir"
        target="$ROOT_NM/$scope_dir/$pkg_name"
        # Replace symlinks with real copies; skip if already a real directory
        if [ -L "$target" ]; then
          rm "$target"
        elif [ -d "$target" ]; then
          continue
        fi
        cp -r "$pkg_dir" "$target"
        continue
      fi
    fi

    # Regular (non-scoped) package
    if [ "$pkg_name" == ".pnpm" ]; then
      continue
    fi
    target="$ROOT_NM/$pkg_name"
    # Replace symlinks with real copies; skip if already a real directory
    if [ -L "$target" ]; then
      rm "$target"
    elif [ -e "$target" ]; then
      continue
    fi
    cp -r "$pkg_dir" "$target"
  done
fi

# ---------------------------------------------------------------------------
# Step 4b: Prune bloat from standalone node_modules
# ---------------------------------------------------------------------------

echo -e "${CYAN}[4b/6] Pruning bloat from standalone...${NC}"

# Remove .pnpm virtual store — everything has been hoisted above
rm -rf "$STANDALONE_DIR/node_modules/.pnpm"

# Remove sharp/native image binaries (images: { unoptimized: true } in next.config)
rm -rf "$STANDALONE_DIR/node_modules/sharp"
rm -rf "$STANDALONE_DIR/node_modules/@img"

# Remove TypeScript (build-only dependency)
rm -rf "$STANDALONE_DIR/node_modules/typescript"

# Remove demo JSONL files
rm -rf "$STANDALONE_WEB/public/demos"

# Strip docs, changelogs, tests from node_modules
find "$STANDALONE_DIR/node_modules" \( -name "*.md" -o -name "CHANGELOG*" -o -name "changelog*" \) -delete 2>/dev/null || true
find "$STANDALONE_DIR/node_modules" \( -name "__tests__" -o -name "test" -o -name "tests" -o -name ".github" \) -type d -exec rm -rf {} + 2>/dev/null || true

# ---------------------------------------------------------------------------
# Step 5: Copy entire standalone tree into bundle/ (preserving layout)
# ---------------------------------------------------------------------------

echo -e "${CYAN}[5/6] Assembling bundle...${NC}"

rm -rf "$BUNDLE_DIR"
cp -r "$STANDALONE_DIR" "$BUNDLE_DIR"

# Remove duplicate root-level Next.js (server.js resolves from apps/web/node_modules/next)
rm -rf "$BUNDLE_DIR/node_modules/next"

# ---------------------------------------------------------------------------
# Step 6: Copy LICENSE into package directory for npm
# ---------------------------------------------------------------------------

echo -e "${CYAN}[6/6] Copying LICENSE...${NC}"

RUNNER_DIR="$ROOT_DIR/packages/local-runner"
cp "$ROOT_DIR/LICENSE" "$RUNNER_DIR/LICENSE"

# ---------------------------------------------------------------------------
# Summary + size guard
# ---------------------------------------------------------------------------

BUNDLE_SIZE=$(du -sh "$BUNDLE_DIR" | cut -f1)
BUNDLE_BYTES=$(du -s "$BUNDLE_DIR" | cut -f1)
MAX_BUNDLE_KB=50000  # 50MB uncompressed — warn if exceeded

echo ""
echo -e "${GREEN}Bundle complete!${NC}"
echo -e "  Location: ${CYAN}$BUNDLE_DIR${NC}"
echo -e "  Size:     ${CYAN}$BUNDLE_SIZE${NC}"

if [ "$BUNDLE_BYTES" -gt "$MAX_BUNDLE_KB" ]; then
  echo ""
  echo -e "${YELLOW}WARNING: Bundle exceeds ${MAX_BUNDLE_KB}KB size budget${NC}"
  echo -e "${YELLOW}Consider auditing dependencies or static assets${NC}"
fi

echo ""
echo "Test locally:"
echo "  node packages/local-runner/bin/agentis-local.js --no-open"
echo ""
echo "Package and test via npx:"
echo "  cd packages/local-runner && npm pack"
echo "  npx ./gpu-cli-agentis-0.1.0.tgz --no-open"
