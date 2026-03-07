# Transcript Locations and Format

Agentis currently focuses on Claude Code transcripts and will support more formats over time.

## Supported Formats

- **Primary support:** Claude Code JSONL transcripts (`.jsonl`)
- **More formats coming soon**

## Where to Find Claude Code Transcripts

Claude Code stores transcripts under a projects directory:

- **macOS:** `~/.claude/projects/`
- **Linux:** `~/.claude/projects/`

Inside each project folder, you will find session directories containing transcript files.

- Files are named with UUIDs
- Files use the `.jsonl` extension

## What's in a Transcript

A transcript file is JSON Lines format, where each line is one JSON object. These lines represent events such as:

- User prompts
- Assistant responses
- Tool calls
- Tool results

## Multiple Files

You can upload multiple `.jsonl` files in one import to replay activity across multiple sessions.

## Privacy

Transcripts are processed entirely in your browser. Nothing is uploaded to any remote server.

## File Size Limit

Agentis currently supports transcript files up to **50MB per file**.
