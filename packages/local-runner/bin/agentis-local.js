#!/usr/bin/env node

// ============================================================================
// @agentis/local — CLI launcher
//
// Starts the Agentis Next.js app in local mode with:
// - AGENTIS_LOCAL_MODE=true (enables /api/local/* discovery routes)
// - NEXT_PUBLIC_AGENTIS_LOCAL=true (enables auto-detected sessions UI)
// - NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT=true (enables transcript page)
// - Binds to 127.0.0.1 (localhost only — transcripts never exposed)
//
// Usage:
//   npx @agentis/local              # Start and open browser
//   npx @agentis/local --no-open    # Start without opening browser
//   npx @agentis/local --port 8080  # Custom port
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
  @agentis/local — Visualize Claude Code sessions locally

  Usage:
    npx @agentis/local [options]

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
// Locate the Next.js app
// ---------------------------------------------------------------------------

// When running from the monorepo, apps/web is the Next.js app
const webAppDir = resolve(__dirname, '../../../apps/web')
const standaloneServer = resolve(webAppDir, '.next/standalone/server.js')

// Prefer standalone server if built, otherwise use next dev
const useStandalone = existsSync(standaloneServer)

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

console.log()
console.log('  \x1b[32m▶ Agentis Local\x1b[0m')
console.log()
console.log(`  Starting on \x1b[36m${url}\x1b[0m`)
console.log('  Auto-discovering transcripts from \x1b[33m~/.claude/projects/\x1b[0m')
console.log()
console.log('  Press \x1b[1mCtrl+C\x1b[0m to stop')
console.log()

let child

if (useStandalone) {
  child = spawn('node', [standaloneServer], {
    env,
    stdio: 'inherit',
    cwd: resolve(webAppDir, '.next/standalone'),
  })
} else {
  // Dev mode: use pnpm dev with port override
  child = spawn('pnpm', ['next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    env,
    stdio: 'inherit',
    cwd: webAppDir,
  })
}

// ---------------------------------------------------------------------------
// Open browser after a short delay
// ---------------------------------------------------------------------------

if (openBrowser) {
  setTimeout(async () => {
    try {
      // Dynamic import to avoid requiring 'open' as a dependency
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
  }, 2000)
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
