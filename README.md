# Agentis 🎮

**Visualize your AI coding sessions as an interactive pixel-art world.**

[![npm version](https://img.shields.io/npm/v/%40agentis%2Flocal?label=%40agentis%2Flocal)](https://www.npmjs.com/package/@agentis/local)
[![License: MIT](https://img.shields.io/github/license/gpu-cli/agentis)](./LICENSE)

## What is this?

Agentis turns AI coding agent transcripts (Claude Code, Cursor, Copilot, and more) into a living, explorable game world. Repositories become islands, modules become districts, files become buildings, and agents animate their actions as your session unfolds.

Privacy-first by design: transcript parsing and visualization run entirely in your browser. No server, no cloud processing, and no data leaves your machine.

## Quick Start

```bash
npx @agentis/local
```

Then upload your transcript file(s) and explore the world.

Supported formats today:
- Claude Code JSONL
- More transcript formats coming soon

## Development

```bash
git clone git@github.com:gpu-cli/agentis.git
cd agentis
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Project Structure

- `apps/web` - Next.js 15 static web app
- `packages/engine` - PixiJS v8 rendering and game runtime
- `packages/ingest` - transcript parsing and normalization
- `packages/shared` - shared types, constants, and utilities
- `packages/ui` - Tailwind v4 + ShadCN-style UI components
- `packages/world-model` - world generation and simulation model

Built with `pnpm` + Turborepo monorepo tooling.

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT - see [`LICENSE`](./LICENSE).

## Credits

Game assets are from [Kenney.nl](https://kenney.nl), licensed under CC0 (public domain).
