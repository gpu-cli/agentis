# Agentis 🎮

**Visualize your AI coding sessions as an interactive pixel-art world.**

[![License: MIT](https://img.shields.io/github/license/gpu-cli/agentis)](./LICENSE)

## What is this?

Agentis turns AI coding agent transcripts (Claude Code, Cursor, Copilot, and more) into a living, explorable game world. Repositories become islands, modules become districts, files become buildings, and agents animate their actions as your session unfolds.

Privacy-first by design: transcript parsing and visualization run entirely in your browser. No server, no cloud processing, and no data leaves your machine.

## Quick Start

```bash
git clone git@github.com:gpu-cli/agentis.git
cd agentis
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000), upload your transcript files, and explore.

Supported formats today:
- Claude Code JSONL
- More transcript formats coming soon

## Useful Commands

```bash
pnpm dev          # Start dev server on :3000
pnpm build        # Production build
pnpm typecheck    # TypeScript check
pnpm test         # Run tests
pnpm lint         # Lint
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
