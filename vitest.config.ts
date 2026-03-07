// ============================================================================
// Vitest Configuration — Multiverse Test Suite
// ============================================================================
//
// Commands:
//   pnpm run test            — run all tests once
//   pnpm run test:watch      — re-run on file changes
//   pnpm run test:coverage   — run with v8 coverage report
//   npx vitest run <path>    — run a specific test file
//
// Test locations (packages/**/__tests__/**/*.test.ts):
//   packages/ingest/src/__tests__/    — parser, canonicalizer, privacy, perf,
//                                       zip-parser, size-validation
//   packages/world-model/src/__tests__/ — work-units, skeleton-layout, branch-state,
//                                         adapter, delete-move-rename
//   packages/engine/src/__tests__/    — replay engine, fog-overlay data layer,
//                                       heat-overlay + occupancy animator data layer
//
// E2E tests (Playwright — separate from vitest):
//   pnpm run test:e2e              — run E2E in headless chromium
//   pnpm run test:e2e:headed       — run E2E with visible browser
//   e2e/transcript-import.spec.ts  — files import flow
//   e2e/transcript-zip-import.spec.ts — zip import flow (scaffolded)
//
// Fixtures:
//   packages/ingest/src/__tests__/fixtures/sample-records.ts
//     — RECORDS_WITH_CWD, PROGRESS_RECORD, RECORDS_WITH_SECRETS,
//       generateLargeRecordSet(count) for synthetic benchmarks
//
// Adding new tests:
//   1. Create __tests__/<name>.test.ts in the relevant package
//   2. Use vitest imports: { describe, it, expect, vi } from 'vitest'
//   3. For timer-dependent tests: vi.useFakeTimers() in beforeEach
//   4. For DOM tests: happy-dom environment is enabled globally
//
// Excluded files (legacy, pre-vitest format — export functions, no describe/it):
//   See 'exclude' list below. These will be migrated or removed over time.
// ============================================================================

import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@multiverse/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@multiverse/world-model': path.resolve(__dirname, 'packages/world-model/src'),
      '@multiverse/ingest': path.resolve(__dirname, 'packages/ingest/src'),
      '@multiverse/engine': path.resolve(__dirname, 'packages/engine/src'),
      '@multiverse/ui': path.resolve(__dirname, 'packages/ui/src'),
    },
  },
  test: {
    include: ['packages/**/__tests__/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      // Old test files that export functions (no vitest describe/it) — pre-existing
      'packages/ingest/src/__tests__/browser-ingest.test.ts',
      'packages/ingest/src/__tests__/browser-persistence.test.ts',
      'packages/ingest/src/__tests__/claude-parser.test.ts',
      'packages/ingest/src/__tests__/determinism.test.ts',
      'packages/ingest/src/__tests__/mode-isolation.test.ts',
      'packages/ingest/src/__tests__/performance.test.ts',
      'packages/ingest/src/__tests__/privacy.test.ts',
      'packages/ingest/src/__tests__/topology.test.ts',
    ],
    environment: 'happy-dom',
    globals: true,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: [
        'packages/ingest/src/**',
        'packages/world-model/src/**',
        'packages/engine/src/replay/**',
      ],
    },
  },
})
