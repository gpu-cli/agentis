#!/usr/bin/env node

/**
 * Pre-publish check: ensures the static export has been copied
 * into packages/local/static/ before npm publish.
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "..", "static");
const indexFile = join(staticDir, "index.html");

if (!existsSync(staticDir) || !existsSync(indexFile)) {
  console.error(
    `ERROR: Static files not found in ${staticDir}\n` +
    `Run the build pipeline first:\n` +
    `  pnpm turbo run build`
  );
  process.exit(1);
}

console.log("✓ Static files present — ready to publish");
