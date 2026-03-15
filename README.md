# Agentis

**Visualize your AI coding sessions as an interactive pixel-art world.**

[![License: MIT](https://img.shields.io/github/license/gpu-cli/agentis)](./LICENSE)

## What is this?

Agentis turns AI coding agent transcripts (Claude Code, Cursor, Copilot, and more) into a living, explorable game world. Repositories become islands, modules become districts, files become buildings, and agents animate their actions as your session unfolds.

Privacy-first by design: transcript parsing and visualization run entirely on your machine. No cloud processing, no data leaves your device.

## Quick Start

```bash
npx @gpu-cli/agentis
```

That's it. Auto-discovers your Claude Code sessions from `~/.claude/projects/` and opens a local visualization at `http://127.0.0.1:3456`.

Options: `--port <number>`, `--no-open` (skip browser). See `npx @gpu-cli/agentis --help`.

### From source

```bash
git clone git@github.com:gpu-cli/agentis.git ~/Development/agentis
cd ~/Development/agentis
pnpm install
pnpm dev              # Start dev server on :3000 with auto-discovery
```

Or build the standalone bundle (what npm users get):

```bash
cd ~/Development/agentis
pnpm build:local      # Build standalone bundle
pnpm local:run        # Start local server
```

Supported formats today:
- Claude Code JSONL
- More transcript formats coming soon

## Commands

```bash
pnpm dev              # Dev server on :3000
pnpm build            # Production build
pnpm typecheck        # TypeScript check
pnpm test             # Run tests
pnpm lint             # Lint
pnpm build:local      # Build @gpu-cli/agentis bundle
pnpm local:run        # Run local server
pnpm local:pack-run   # Package + run via npx (tests real artifact)
pnpm local:clean      # Remove bundle/tarball artifacts
```

## Project Structure

- `apps/web` — Next.js 15 web app
- `packages/engine` — PixiJS v8 rendering and game runtime
- `packages/ingest` — Transcript parsing and normalization
- `packages/shared` — Shared types, constants, and utilities
- `packages/ui` — Tailwind v4 + ShadCN-style UI components
- `packages/world-model` — World generation and simulation model

Built with `pnpm` + Turborepo monorepo tooling.

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT — see [`LICENSE`](./LICENSE).

## Credits

Game assets are from [Kenney.nl](https://kenney.nl), licensed under CC0 (public domain).
