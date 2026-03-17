# Troubleshooting

Common issues when running Agentis.

## Setup & Running

### Port already in use

**Problem:** `npx @gpu-cli/agentis` fails because the default port is occupied.

**Solution:** Start the app on a different port:

```bash
npx @gpu-cli/agentis --port 3001
```

### Browser does not open

**Problem:** The browser does not open automatically after starting.

**Solution:** Open the URL printed in the terminal manually, or use `--no-open`:

```bash
npx @gpu-cli/agentis --no-open
```

## Session Discovery

### No sessions found

**Problem:** The sessions tab is empty even though you have Claude Code transcripts.

**Solution:**

- Check that `~/.claude/projects/` exists and contains `.jsonl` files
- Run a Claude Code session first, then refresh the page
- Set `CLAUDE_PROJECTS_PATH` if your transcripts are in a non-standard location

### Sessions are stale or missing recent ones

**Problem:** New Claude Code sessions don't appear in the list.

**Solution:** The app re-scans when the window gets focus. Switch away and back, or click refresh. New sessions appear as soon as Claude Code writes transcript files.

## Import & Visualization

### Transcript upload fails

**Problem:** Upload/import fails or no data appears.

**Solution:** Check that the transcript is a valid **JSONL** file:
- Each line must be valid JSON
- The file must not be empty
- Only `.jsonl`, `.json`, and `.zip` files are accepted

### Slow initial load on large files

**Problem:** Very large transcripts feel slow during initial load.

**Solution:** Files over ~20 MB can take 10-30 seconds to process. Watch the progress bar for status.

### Blank screen or WebGL error

**Problem:** You see a blank canvas or WebGL initialization errors.

**Solution:** PixiJS v8 requires **WebGL2**. Use a modern browser (Chrome, Firefox, or Edge) and make sure hardware acceleration is enabled.

## Node.js & Dependencies

### Node.js version issues

**Problem:** Install/build/dev commands fail.

**Solution:** Agentis requires **Node.js 18+**. Check your version:

```bash
node --version
```

### pnpm not found

**Problem:** `pnpm` command is not recognized.

**Solution:** Enable pnpm via Corepack (bundled with Node.js 16+):

```bash
corepack enable
```
