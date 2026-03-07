# Troubleshooting
This guide covers common issues when running the Agentis web app and transcript pipeline.

## Port already in use

**Problem:** `pnpm dev` fails because the default port is occupied.

**Solution:** Start the app on a different port with `--port <number>`.

```bash
pnpm dev -- --port 3001
```

## Browser doesn't open

**Problem:** The browser does not open automatically after starting development.

**Solution:** Open the URL printed in the terminal manually. On headless servers, run with `--no-open`.

```bash
pnpm dev -- --no-open
```

## Blank screen or WebGL error

**Problem:** You see a blank canvas or WebGL initialization errors.

**Solution:** PixiJS v8 requires **WebGL2**. Use a modern browser (Chrome, Firefox, or Edge) and ensure hardware acceleration is enabled.

## Transcript won't load

**Problem:** Upload/import fails or no data appears.

**Solution:** Verify the transcript is a valid **JSONL** file:
- each line must be valid JSON
- the file must not be empty

## Large file performance

**Problem:** Very large transcripts feel slow during initial load.

**Solution:** For files larger than ~20MB, initial processing can take **10-30 seconds**. Watch the progress bar for pipeline status.

## Node.js version issues

**Problem:** Install/build/dev commands fail unexpectedly.

**Solution:** Agentis requires **Node.js 18+**. Check your version:

```bash
node --version
```
