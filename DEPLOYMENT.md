# Multiverse — Deployment & Publishing Guide

## Architecture

- **HQ (`~/Development/hq/multiverse`)** — Source of truth. All code changes happen here.
- **Agentis (`~/Development/agentis`)** — Public OSS mirror. Auto-synced from HQ on push.
- **npm (`@gpu-cli/agentis`)** — Published package. Manual release only.

## How Code Flows

```
HQ multiverse  ──push──>  GitHub (hq repo)
                              │
                              ▼ (auto-mirror workflow)
                        Agentis repo (main branch)
                              │
                              ▼ (manual tag only)
                        npm @gpu-cli/agentis
```

1. You push code to HQ → GitHub Action auto-mirrors to agentis repo
2. npm publish only happens when you manually push a `local-v*` tag to agentis

## Day-to-Day Development

Just work in HQ as normal. Push to your branch or main. The mirror workflow
handles syncing to agentis automatically on every push to `main`.

```bash
cd ~/Development/hq
# make changes in multiverse/
git add . && git commit -m "feat: your change"
git push
# → agentis repo updates automatically
```

## Publishing a New npm Version

Only do this when you want users to get a new version via `npx @gpu-cli/agentis`.

```bash
cd ~/Development/agentis

# 1. Bump version
cd packages/local-runner
npm version patch   # or: npm version minor / npm version major
cd ../..

# 2. Commit the version bump
git add packages/local-runner/package.json
git commit -m "release: @gpu-cli/agentis v$(node -p "require('./packages/local-runner/package.json').version")"

# 3. Tag and push (triggers the release workflow)
VERSION=$(node -p "require('./packages/local-runner/package.json').version")
git tag "local-v$VERSION"
git push && git push origin "local-v$VERSION"
```

The `release-local.yml` workflow will:
- Build the standalone Next.js bundle
- Pack the tarball
- Smoke test it (starts server, verifies HTTP 200)
- Publish to npm with provenance

## Verifying a Release

```bash
# Check npm
npm view @gpu-cli/agentis version

# Test the package
npx @gpu-cli/agentis --no-open
```

## Testing Locally (Before Publishing)

From the agentis repo:

```bash
# Quick run from source (fastest)
pnpm build:local
pnpm local:run

# Test the real packaged artifact (what npm users get)
pnpm local:pack-run

# Clean up build artifacts after testing
pnpm local:clean
```

## Key Files

| File | Purpose |
|------|---------|
| `multiverse/scripts/mirror-to-agentis.sh` | Rsync-based mirror script (HQ → agentis) |
| `.github/workflows/mirror-to-agentis.yml` | Auto-mirror on push to main |
| `packages/local-runner/package.json` | npm package manifest (`@gpu-cli/agentis`) |
| `packages/local-runner/bin/agentis-local.js` | CLI entrypoint |
| `scripts/build-local.sh` | Builds standalone Next.js bundle for npm |

(The last three paths are in the agentis repo, not HQ.)

## Mirror Script Details

The mirror script (`multiverse/scripts/mirror-to-agentis.sh`) uses rsync with:

- **Blocklist**: Files that must NOT appear in the public repo (AGENTS.md, railway.toml, real transcripts, etc.)
- **Target-only files**: Files that only exist in agentis and are preserved during sync (LICENSE, CONTRIBUTING.md, packages/local-runner/, .github/, etc.)

## Troubleshooting

**Mirror workflow failed**: Check the Actions tab on the HQ repo. Common issues:
- `AGENTIS_PAT` secret expired or missing (Fine-grained PAT with Contents read/write on gpu-cli/agentis)
- Agentis repo has conflicting changes on main

**npm publish failed**: Check the Actions tab on the agentis repo. Common issues:
- `NPM_TOKEN` secret expired or missing in the `npm-publish` environment
- Token doesn't have Bypass 2FA enabled
- Bundle build failed

**Stale local UI**: If you're testing locally and see old UI, you're running a stale bundle:
```bash
pnpm local:clean    # delete old bundle
pnpm build:local    # rebuild
pnpm local:run      # run fresh
```
