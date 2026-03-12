# Agentis

**Visualize your AI coding sessions as an interactive pixel-art world.**

[![License: MIT](https://img.shields.io/github/license/gpu-cli/agentis)](./LICENSE)

## What is this?

Agentis turns AI coding agent transcripts (Claude Code, Cursor, Copilot, and more) into a living, explorable game world. Repositories become islands, modules become districts, files become buildings, and agents animate their actions as your session unfolds.

Privacy-first by design: transcript parsing and visualization run entirely on your machine. No cloud processing, no data leaves your device.

## Quick Start

### For users

```bash
git clone git@github.com:gpu-cli/agentis.git
cd agentis
pnpm install
AGENTIS_LOCAL_MODE=true NEXT_PUBLIC_AGENTIS_LOCAL=true NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT=true pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Your Claude Code sessions from `~/.claude/projects/` are automatically detected — pick one and visualize, or upload transcript files manually.

### For contributors

```bash
git clone git@github.com:gpu-cli/agentis.git
cd agentis
pnpm install
pnpm dev
```

Supported formats today:
- Claude Code JSONL
- More transcript formats coming soon

## Useful Commands

```bash
pnpm dev              # Start dev server on :3000
pnpm build            # Production build
pnpm typecheck        # TypeScript check
pnpm test             # Run tests
pnpm lint             # Lint
```

## Auto-Discovery (Local Mode)

When running with `AGENTIS_LOCAL_MODE=true`, the app scans `~/.claude/projects/` and shows your Claude Code sessions directly in the import screen. Select any session to load it instantly — no manual file hunting needed.

The discovery runs entirely on your machine via local API routes bound to `127.0.0.1`. Your transcripts never leave your device.

To enable auto-discovery in dev:

```bash
AGENTIS_LOCAL_MODE=true NEXT_PUBLIC_AGENTIS_LOCAL=true NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT=true pnpm dev
```

Or create `apps/web/.env.local`:

```env
AGENTIS_LOCAL_MODE=true
NEXT_PUBLIC_AGENTIS_LOCAL=true
NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT=true
```

Manual upload (Files, Folder, Zip) is always available as a fallback.

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
