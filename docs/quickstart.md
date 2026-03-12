# Agentis Quickstart

Agentis turns AI coding transcripts into a pixel-art game world you can explore in your browser.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- [pnpm](https://pnpm.io/) (install with `corepack enable`)

## Clone and Run

```bash
git clone git@github.com:gpu-cli/agentis.git
cd agentis
pnpm install
```

For **auto-discovery** of Claude Code transcripts (recommended):

```bash
AGENTIS_LOCAL_MODE=true NEXT_PUBLIC_AGENTIS_LOCAL=true NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT=true pnpm dev
```

Or for basic dev mode (manual upload only):

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Import a Transcript

### Option A: Auto-Discovery (recommended)

When running in local mode, the app automatically scans `~/.claude/projects/` and shows your recent Claude Code sessions. Click **Load latest session** or pick any session from the list.

No manual file selection needed — the app reads transcripts directly from your filesystem.

### Option B: Manual Upload

1. Click the manual upload section below the auto-detected sessions.
2. Name your project and select `.jsonl` transcript files, a folder, or a `.zip` archive.
3. Click **Run** to import and visualize.

You can upload multiple `.jsonl` files in one import to replay activity across multiple sessions.

## Try a Demo

Want to explore without your own files? Click **Demo Mode** on the home screen, or navigate directly to `/demo`. This loads built-in sample scenarios so you can see the visualization in action.

## What You'll See

- **Islands** represent repositories
- **Districts** represent modules or directories
- **Buildings** represent files
- Animated agents move around performing actions based on transcript events

You can use this to understand what happened during coding sessions at a glance.

## Troubleshooting

### No sessions found

- Check that `~/.claude/projects/` exists and contains `.jsonl` files
- Run a Claude Code session first, then refresh the page
- Set `CLAUDE_PROJECTS_PATH` env var if your transcripts are in a non-standard location

### Manual upload not working

- Ensure files are `.jsonl` or `.json` format
- Check browser console for errors
- Try the Zip import mode for large sessions
