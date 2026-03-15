# Contributing Guide

This document supplements the root `CONTRIBUTING.md` with monorepo-specific guidance for Agentis.

## Architecture overview

Agentis is a **pnpm + Turborepo** monorepo organized into packages and apps.

### Packages (`packages/`)

- `engine`: PixiJS v8 rendering runtime for the game/world visualization
- `ingest`: Transcript parsing and normalization pipeline
- `shared`: Shared TypeScript types, constants, and cross-package utilities
- `ui`: Reusable UI components and presentation helpers
- `world-model`: World layout and generation logic from parsed data

### Apps (`apps/`)

- `web`: Next.js 15 application that composes ingest + world model + engine into the browser experience

## Development setup

```bash
git clone git@github.com:gpu-cli/agentis.git
cd agentis
pnpm install
pnpm dev
```

`pnpm dev` starts the Next.js app on `http://localhost:3000` by default with auto-discovery of Claude Code sessions enabled.

## Key commands

Run these commands from the monorepo root:

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Testing

- **Unit tests:** Vitest
- **E2E tests:** Playwright
- **Test locations:** `__tests__/` directories inside each package/app

When adding features or fixing bugs, include or update tests near the code you changed.

## Adding a new transcript format

Most transcript-format work lives in `packages/ingest`:

- `parser.ts`: Add parsing and normalization logic for the new format
- `browser/index.ts`: Expose browser-safe APIs so the web app can use the parser

Keep parser output aligned with shared types and existing ingest contracts.

## Code style and conventions

- TypeScript runs in **strict mode**
- Styling uses **Tailwind CSS v4**
- Prefer **named exports**; avoid default exports except for framework-required files (for example Next.js `page`/`layout` files)

Before opening a PR, run typecheck, lint, and tests locally.
