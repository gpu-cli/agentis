#!/usr/bin/env node

// ============================================================================
// @gpu-cli/agentis — CLI launcher
//
// Starts the Agentis Next.js app in local mode with:
// - AGENTIS_LOCAL_MODE=true (enables /api/local/* discovery routes)
// - NEXT_PUBLIC_AGENTIS_LOCAL=true (enables auto-detected sessions UI)
// - NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT=true (enables transcript page)
// - Binds to 127.0.0.1 (localhost only — transcripts never exposed)
//
// Resolution order:
// 1. Bundled standalone (../bundle/server.js) — used when installed via npm
// 2. Monorepo standalone (apps/web/.next/standalone) — used after build-local.sh
// 3. Monorepo dev mode (next dev via local binary) — used during development
//
// Usage:
//   npx @gpu-cli/agentis              # Start and open browser
//   npx @gpu-cli/agentis --no-open    # Start without opening browser
//   npx @gpu-cli/agentis --port 8080  # Custom port
// ============================================================================

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
let port = 3456
let openBrowser = true

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10)
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${args[i + 1]}`)
      process.exit(1)
    }
    i++
  } else if (args[i] === '--no-open') {
    openBrowser = false
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
  @gpu-cli/agentis — Visualize Claude Code sessions locally

  Usage:
    npx @gpu-cli/agentis [options]

  Options:
    --port <number>   Port to run on (default: 3456)
    --no-open         Don't open browser automatically
    --help, -h        Show this help message

  Your Claude Code transcripts are auto-discovered from ~/.claude/projects/
  and never leave your machine.
`)
    process.exit(0)
  }
}

// ---------------------------------------------------------------------------
// Resolve server mode
// ---------------------------------------------------------------------------

// Mode 1: Bundled standalone (npm package install via npx)
// The bundle preserves the monorepo layout: bundle/apps/web/server.js
// CWD must be bundle/ (the standalone root) for module resolution to work.
const bundleDir = resolve(__dirname, '../bundle')
const bundledServer = resolve(bundleDir, 'apps/web/server.js')

// Mode 2: Monorepo standalone (after running scripts/build-local.sh)
const monorepoRoot = resolve(__dirname, '../../../')
const monorepoWebDir = resolve(monorepoRoot, 'apps/web')
const standaloneDir = resolve(monorepoWebDir, '.next/standalone')
const monorepoStandalone = resolve(standaloneDir, 'apps/web/server.js')

// Mode 3: Monorepo dev (next dev via local binary)
const nextBin = resolve(monorepoWebDir, 'node_modules/.bin/next')

/** @type {'bundled' | 'standalone' | 'dev' | null} */
let mode = null
/** @type {string} */
let serverPath = ''
/** @type {string} */
let cwd = ''

if (existsSync(bundledServer)) {
  mode = 'bundled'
  serverPath = bundledServer
  cwd = bundleDir
} else if (existsSync(monorepoStandalone)) {
  mode = 'standalone'
  serverPath = monorepoStandalone
  cwd = standaloneDir
} else if (existsSync(nextBin)) {
  mode = 'dev'
  serverPath = nextBin
  cwd = monorepoWebDir
}

if (!mode) {
  console.error(`
  \x1b[31mError: Could not find Agentis server.\x1b[0m

  This can happen if:
  • You're running from an npm install but the bundle wasn't included
  • You're in the monorepo but haven't built yet

  To fix, run one of:
    \x1b[36m# From the agentis repo — build standalone bundle\x1b[0m
    ./scripts/build-local.sh

    \x1b[36m# From the agentis repo — quick dev mode\x1b[0m
    pnpm install
    pnpm dev
`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const env = {
  ...process.env,
  AGENTIS_LOCAL_MODE: 'true',
  NEXT_PUBLIC_AGENTIS_LOCAL: 'true',
  NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT: 'true',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
}

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

const url = `http://127.0.0.1:${port}`
const modeLabel = mode === 'bundled' ? 'bundled' : mode === 'standalone' ? 'standalone' : 'dev'

console.log()
console.log('  \x1b[32m▶ Agentis Local\x1b[0m')
console.log()
console.log(`  Starting on \x1b[36m${url}\x1b[0m  \x1b[90m(${modeLabel} mode)\x1b[0m`)
console.log('  Auto-discovering transcripts from \x1b[33m~/.claude/projects/\x1b[0m')
console.log()
console.log('  Press \x1b[1mCtrl+C\x1b[0m to stop')
console.log()

let child

if (mode === 'dev') {
  // Dev mode: run next dev via the local binary (no pnpm needed)
  child = spawn(serverPath, ['dev', '-p', String(port), '-H', '127.0.0.1'], {
    env,
    stdio: 'inherit',
    cwd,
  })
} else {
  // Bundled or standalone: run node server.js directly
  child = spawn(process.execPath, [serverPath], {
    env,
    stdio: 'inherit',
    cwd,
  })
}

// ---------------------------------------------------------------------------
// Open browser after a short delay
// ---------------------------------------------------------------------------

if (openBrowser) {
  const delay = mode === 'dev' ? 3000 : 1500
  setTimeout(() => {
    try {
      const platform = process.platform
      if (platform === 'darwin') {
        spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
      } else if (platform === 'win32') {
        spawn('cmd', ['/c', 'start', url], { stdio: 'ignore', detached: true }).unref()
      } else {
        spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
      }
    } catch {
      console.log(`  Open \x1b[36m${url}\x1b[0m in your browser`)
    }
  }, delay)
}

// ---------------------------------------------------------------------------
// Clean shutdown
// ---------------------------------------------------------------------------

function cleanup() {
  if (child && !child.killed) {
    child.kill('SIGTERM')
  }
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
child.on('exit', (code) => process.exit(code ?? 0))
