# Contributing to agentis

Thanks for your interest in contributing to `agentis`.

## Workflow

1. Fork the repository to your own GitHub account.
2. Create a feature branch from `main`:

```bash
git checkout -b feat/your-change
```

3. Make your changes with clear commits.
4. Open a Pull Request back to `gpu-cli/agentis`.

## Local development

This repo uses `pnpm` and a Turborepo workspace layout (`apps/*`, `packages/*`, and supporting tooling).

Install dependencies and run the project locally:

```bash
pnpm install
pnpm dev
```

## Before opening a PR

Run all quality checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Please ensure everything passes before submitting your PR.

## Code style and standards

- Language: TypeScript with strict type checking
- Styling: Tailwind CSS v4
- Keep changes focused and aligned with existing workspace patterns

## Pull request expectations

- Include a clear description of what changed and why.
- Link related issues when applicable.
- Add or update tests when behavior changes.

By contributing, you agree that your contributions will be licensed under the repository's MIT License.
