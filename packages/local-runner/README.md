# @gpu-cli/agentis

Visualize your Claude Code sessions as an interactive pixel-art world — entirely on your machine.

## Quick Start

```bash
npx @gpu-cli/agentis
```

That's it. Your browser opens to a local server that auto-discovers Claude Code transcripts from `~/.claude/projects/` and lets you visualize them instantly.

## Options

```
npx @gpu-cli/agentis [options]

  --port <number>   Port to run on (default: 3456)
  --no-open         Don't open browser automatically
  --help, -h        Show help
```

## What It Does

1. Starts a local Next.js server bound to `127.0.0.1` (localhost only)
2. Scans `~/.claude/projects/` for Claude Code session transcripts
3. Presents an import screen where you can pick any session or upload files manually
4. Renders the session as an explorable pixel-art world

## Privacy

- All processing happens locally — no data leaves your machine
- Server binds to `127.0.0.1` only — not accessible from the network
- No telemetry, no analytics, no tracking
- Open source: [github.com/gpu-cli/agentis](https://github.com/gpu-cli/agentis)

## Requirements

- Node.js >= 20.11
- Claude Code sessions in `~/.claude/projects/` (for auto-discovery)

## Troubleshooting

**Port already in use**

```bash
npx @gpu-cli/agentis --port 4000
```

**No sessions found**

The auto-discovery scans `~/.claude/projects/`. If you haven't run Claude Code yet, use the Upload tab to import `.jsonl` or `.json` transcript files manually.

**Bundle missing (development)**

If running from a git clone:

```bash
pnpm build:local           # Build the standalone bundle
pnpm local:run             # Start the server
```

## License

MIT
