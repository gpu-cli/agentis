#!/usr/bin/env node

/**
 * Copies the Next.js static export from apps/web/out/ into packages/local/static/.
 *
 * Run this after `next build` with the export config to bundle
 * the pre-built site into the @agentis/local npm package.
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const webOut = join(packageRoot, "..", "..", "apps", "web", "out");
const staticDir = join(packageRoot, "static");

if (!existsSync(webOut)) {
  console.error(
    `ERROR: Static export not found at ${webOut}\n` +
    `Run the web app build first:\n` +
    `  NEXT_CONFIG_FILE=next.config.export.ts pnpm --filter @multiverse/web build`
  );
  process.exit(1);
}

// Clean previous static output
if (existsSync(staticDir)) {
  rmSync(staticDir, { recursive: true });
}

// Copy the full static export
cpSync(webOut, staticDir, { recursive: true });

console.log(`✓ Copied static export to ${staticDir}`);
