// ============================================================================
// E2E: Transcript Files Import Flow (hq-gij.6.1)
// ============================================================================

import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// ---------------------------------------------------------------------------
// Fixtures — Create temporary JSONL files for upload
// ---------------------------------------------------------------------------

function createTempJsonl(name: string, records: Array<Record<string, unknown>>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multiverse-e2e-'))
  const filePath = path.join(dir, name)
  const content = records.map(r => JSON.stringify(r)).join('\n')
  fs.writeFileSync(filePath, content)
  return filePath
}

const VALID_RECORDS = [
  {
    type: 'user',
    ts: '2026-01-01T00:00:00.000Z',
    content: [{ type: 'text', text: 'Hello world' }],
  },
  {
    type: 'assistant',
    ts: '2026-01-01T00:00:01.000Z',
    cwd: '/Users/dev/myproject',
    gitBranch: 'main',
    content: [
      { type: 'tool_use', name: 'Read', input: { file_path: '/Users/dev/myproject/src/main.ts' } },
    ],
  },
  {
    type: 'assistant',
    ts: '2026-01-01T00:00:02.000Z',
    cwd: '/Users/dev/myproject',
    content: [
      { type: 'tool_use', name: 'Write', input: { file_path: '/Users/dev/myproject/src/utils.ts', content: 'export const add = (a, b) => a + b' } },
    ],
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Transcript Import Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/transcript')
  })

  test('shows upload screen on first visit', async ({ page }) => {
    await expect(page.getByText('Upload Transcripts')).toBeVisible()
    await expect(page.getByPlaceholder('your-repo-name')).toBeVisible()
    await expect(page.getByText('Create Replay')).toBeVisible()
  })

  test('Create Replay button is disabled without project name', async ({ page }) => {
    const button = page.getByRole('button', { name: /Create Replay/i })
    await expect(button).toBeDisabled()
  })

  test('Create Replay button is disabled without files', async ({ page }) => {
    await page.getByPlaceholder('your-repo-name').fill('test-project')
    const button = page.getByRole('button', { name: /Create Replay/i })
    await expect(button).toBeDisabled()
  })

  test('can upload JSONL file and see file list', async ({ page }) => {
    const filePath = createTempJsonl('session.jsonl', VALID_RECORDS)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    await expect(page.getByText('1 file(s) selected')).toBeVisible()
    await expect(page.getByText('session.jsonl')).toBeVisible()

    // Cleanup
    fs.unlinkSync(filePath)
  })

  test('can upload multiple files', async ({ page }) => {
    const file1 = createTempJsonl('session1.jsonl', VALID_RECORDS)
    const file2 = createTempJsonl('session2.jsonl', VALID_RECORDS)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([file1, file2])

    await expect(page.getByText('2 file(s) selected')).toBeVisible()

    // Cleanup
    fs.unlinkSync(file1)
    fs.unlinkSync(file2)
  })

  test('full import flow: name + file → replay screen', async ({ page }) => {
    const filePath = createTempJsonl('session.jsonl', VALID_RECORDS)

    // Fill project name
    await page.getByPlaceholder('your-repo-name').fill('test-project')

    // Upload file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    // Click Create Replay
    const button = page.getByRole('button', { name: /Create Replay/i })
    await expect(button).toBeEnabled()
    await button.click()

    // Wait for replay screen to appear (loading may take a moment)
    // Look for playback controls or project name badge
    await expect(page.getByText('test-project')).toBeVisible({ timeout: 15_000 })

    // Cleanup
    fs.unlinkSync(filePath)
  })

  test('shows error for invalid file content', async ({ page }) => {
    const filePath = createTempJsonl('bad.jsonl', [])

    await page.getByPlaceholder('your-repo-name').fill('test-project')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    const button = page.getByRole('button', { name: /Create Replay/i })
    await button.click()

    // Should show error or stay on import screen (no records to replay)
    // The exact behavior depends on how TranscriptPage handles empty records
    await page.waitForTimeout(2000)

    // Either we see an error or we're still on the import screen
    const stillOnImport = await page.getByText('Upload Transcripts').isVisible()
    const hasError = await page.locator('.text-red-400').isVisible()
    expect(stillOnImport || hasError).toBe(true)

    fs.unlinkSync(filePath)
  })

  test('replay screen has playback controls', async ({ page }) => {
    const filePath = createTempJsonl('session.jsonl', VALID_RECORDS)

    await page.getByPlaceholder('your-repo-name').fill('my-repo')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    await page.getByRole('button', { name: /Create Replay/i }).click()

    // Wait for replay to load
    await expect(page.getByText('my-repo')).toBeVisible({ timeout: 15_000 })

    // Check for speed buttons
    await expect(page.getByText('1x')).toBeVisible()

    // Check for Replace and Clear buttons
    await expect(page.getByText('Replace')).toBeVisible()
    await expect(page.getByText('Clear')).toBeVisible()

    fs.unlinkSync(filePath)
  })

  test('Clear button returns to import screen', async ({ page }) => {
    const filePath = createTempJsonl('session.jsonl', VALID_RECORDS)

    await page.getByPlaceholder('your-repo-name').fill('my-repo')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)
    await page.getByRole('button', { name: /Create Replay/i }).click()

    // Wait for replay
    await expect(page.getByText('my-repo')).toBeVisible({ timeout: 15_000 })

    // Click Clear
    await page.getByText('Clear').click()

    // Should return to import screen
    await expect(page.getByText('Upload Transcripts')).toBeVisible({ timeout: 5_000 })

    fs.unlinkSync(filePath)
  })

  test('Replace button returns to import screen', async ({ page }) => {
    const filePath = createTempJsonl('session.jsonl', VALID_RECORDS)

    await page.getByPlaceholder('your-repo-name').fill('my-repo')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)
    await page.getByRole('button', { name: /Create Replay/i }).click()

    await expect(page.getByText('my-repo')).toBeVisible({ timeout: 15_000 })

    await page.getByText('Replace').click()
    await expect(page.getByText('Upload Transcripts')).toBeVisible({ timeout: 5_000 })

    fs.unlinkSync(filePath)
  })
})
