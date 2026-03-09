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
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Upload a Transcript

1. Click **Upload Transcripts** on the home screen.
2. Select one or more `.jsonl` transcript files from your computer.

Agentis will parse them and build a visual replay.

## Try a Demo

Want to explore without your own files? Click **Demo Mode** on the home screen, or navigate directly to `/demo`. This loads built-in sample scenarios so you can see the visualization in action.

## What You'll See

- **Islands** represent repositories
- **Districts** represent modules or directories
- **Buildings** represent files
- Animated agents move around performing actions based on transcript events

You can use this to understand what happened during coding sessions at a glance.
