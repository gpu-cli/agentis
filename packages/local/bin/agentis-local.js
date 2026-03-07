#!/usr/bin/env node

/**
 * @agentis/local — CLI entry point
 *
 * Serves the pre-built static site on a local port and opens the browser.
 * All transcript processing happens client-side; no data leaves your machine.
 *
 * Usage:
 *   npx @agentis/local              # serve on random available port
 *   npx @agentis/local --port 3333  # serve on specific port
 *   npx @agentis/local --no-open    # don't auto-open browser
 */

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sirv from "sirv";
import open from "open";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse CLI flags
const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const requestedPort =
  portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 0;
const noOpen = args.includes("--no-open");
const help = args.includes("--help") || args.includes("-h");

if (help) {
  console.log(`
  @agentis/local — Visualize AI coding agent transcripts

  Usage:
    npx @agentis/local [options]

  Options:
    --port <number>   Port to serve on (default: random available port)
    --no-open         Don't auto-open the browser
    --help, -h        Show this help message

  All processing happens locally in your browser.
  No data is sent to any server.
`);
  process.exit(0);
}

// Resolve the static files directory
const staticDir = join(__dirname, "..", "static");

// Create a handler for static files with SPA fallback
const handler = sirv(staticDir, {
  single: true, // SPA fallback: serve index.html for unknown routes
  dev: false,
  gzip: true,
  brotli: true,
});

const server = createServer(handler);

server.listen(requestedPort, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" ? address?.port : requestedPort;
  const url = `http://127.0.0.1:${port}`;

  console.log();
  console.log("  \x1b[36m@agentis/local\x1b[0m is running");
  console.log();
  console.log(`  → ${url}`);
  console.log();
  console.log(
    "  Upload your transcript files to visualize coding sessions."
  );
  console.log("  All processing happens locally — no data leaves your machine.");
  console.log();
  console.log("  Press \x1b[1mCtrl+C\x1b[0m to stop.");
  console.log();

  if (!noOpen) {
    open(url).catch(() => {
      // Silently ignore if browser can't be opened (e.g., headless server)
    });
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n  Shutting down...\n");
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
