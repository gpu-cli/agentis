# Agentis - Deployment & Publishing Guide

## Architecture

- **GitHub** ([gpu-cli/agentis](https://github.com/gpu-cli/agentis)) - Source repository
- **npm** (`@gpu-cli/agentis`) - Published package. Manual release only.

## Publishing a New npm Version

Only do this when you want users to get a new version via `npx @gpu-cli/agentis`.

```bash
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
| `packages/local-runner/package.json` | npm package manifest (`@gpu-cli/agentis`) |
| `packages/local-runner/bin/agentis-local.js` | CLI entrypoint |
| `scripts/build-local.sh` | Builds standalone Next.js bundle for npm |

## Troubleshooting

**npm publish failed**: Check the Actions tab on the repo. Common issues:
- `NPM_TOKEN` secret expired or missing in the `npm-publish` environment
- Token doesn't have Bypass 2FA enabled
- Bundle build failed

**Stale local UI**: If you're testing locally and see old UI, you're running a stale bundle:
```bash
pnpm local:clean    # delete old bundle
pnpm build:local    # rebuild
pnpm local:run      # run fresh
```
