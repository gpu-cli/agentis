# Agentis Quickstart

Agentis turns AI coding transcripts into a pixel-art game world you can explore in your browser.

## Prerequisites

- Node.js 18 or newer

## Install and Run

In any terminal, run:

```bash
npx @agentis/local
```

This command starts a local web server and opens Agentis in your browser.

## Upload a Transcript

1. Open Agentis in your browser.
2. Click **Upload Transcripts**.
3. Select one or more `.jsonl` transcript files from your computer.

Agentis will load them and build a visual replay.

## Try a Demo

Want to test quickly without your own files? Open:

```text
/demo
```

Demo mode loads built-in sample scenarios so you can see how the visualization works right away.

## CLI Options

- `--port` - choose which local port to run on
- `--no-open` - start the server without automatically opening a browser tab
- `--help` - show all available command options

## What You'll See

- **Islands** represent repositories
- **Districts** represent modules
- **Buildings** represent files
- Animated agents move around and perform actions based on transcript events

You can use this view to understand what happened during coding sessions at a glance.
