// ============================================================================
// E2E: Transcript Import Flows — Files + Zip (hq-gij.6)
//
// Verifies that the TranscriptImportScreen accepts both .jsonl files and .zip
// archives via the Files/Zip mode tabs.
// ============================================================================

import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createTempFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multiverse-e2e-zip-'))
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

/**
 * Create a minimal .zip file containing a single .jsonl file.
 * Uses the PK\x03\x04 local file header format with STORE (no compression).
 */
function createMinimalZip(jsonlContent: string): Buffer {
  const fileName = 'session.jsonl'
  const data = Buffer.from(jsonlContent, 'utf-8')
  const fileNameBuf = Buffer.from(fileName, 'utf-8')

  // Local file header
  const localHeader = Buffer.alloc(30)
  localHeader.writeUInt32LE(0x04034b50, 0) // signature
  localHeader.writeUInt16LE(20, 4) // version needed
  localHeader.writeUInt16LE(0, 6) // flags
  localHeader.writeUInt16LE(0, 8) // compression: STORE
  localHeader.writeUInt16LE(0, 10) // mod time
  localHeader.writeUInt16LE(0, 12) // mod date
  // CRC-32 — compute simple CRC
  const crc = crc32(data)
  localHeader.writeUInt32LE(crc, 14) // crc-32
  localHeader.writeUInt32LE(data.length, 18) // compressed size
  localHeader.writeUInt32LE(data.length, 22) // uncompressed size
  localHeader.writeUInt16LE(fileNameBuf.length, 26) // file name length
  localHeader.writeUInt16LE(0, 28) // extra field length

  const localFileOffset = 0
  const localEntry = Buffer.concat([localHeader, fileNameBuf, data])

  // Central directory entry
  const centralHeader = Buffer.alloc(46)
  centralHeader.writeUInt32LE(0x02014b50, 0) // signature
  centralHeader.writeUInt16LE(20, 4) // version made by
  centralHeader.writeUInt16LE(20, 6) // version needed
  centralHeader.writeUInt16LE(0, 8) // flags
  centralHeader.writeUInt16LE(0, 10) // compression: STORE
  centralHeader.writeUInt16LE(0, 12) // mod time
  centralHeader.writeUInt16LE(0, 14) // mod date
  centralHeader.writeUInt32LE(crc, 16) // crc-32
  centralHeader.writeUInt32LE(data.length, 20) // compressed size
  centralHeader.writeUInt32LE(data.length, 24) // uncompressed size
  centralHeader.writeUInt16LE(fileNameBuf.length, 28) // file name length
  centralHeader.writeUInt16LE(0, 30) // extra field length
  centralHeader.writeUInt16LE(0, 32) // file comment length
  centralHeader.writeUInt16LE(0, 34) // disk number start
  centralHeader.writeUInt16LE(0, 36) // internal file attributes
  centralHeader.writeUInt32LE(0, 38) // external file attributes
  centralHeader.writeUInt32LE(localFileOffset, 42) // offset of local header

  const centralEntry = Buffer.concat([centralHeader, fileNameBuf])

  // End of central directory
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // signature
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // disk with central dir
  eocd.writeUInt16LE(1, 8) // entries on this disk
  eocd.writeUInt16LE(1, 10) // total entries
  eocd.writeUInt32LE(centralEntry.length, 12) // central dir size
  eocd.writeUInt32LE(localEntry.length, 16) // central dir offset
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([localEntry, centralEntry, eocd])
}

/** Simple CRC-32 implementation for zip creation */
function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

const VALID_RECORDS = [
  {
    type: 'user',
    ts: '2026-01-01T00:00:00.000Z',
    content: [{ type: 'text', text: 'Create a component' }],
  },
  {
    type: 'assistant',
    ts: '2026-01-01T00:00:01.000Z',
    cwd: '/Users/dev/project',
    gitBranch: 'main',
    content: [
      { type: 'tool_use', name: 'Write', input: { file_path: '/Users/dev/project/src/app.tsx', content: 'export default function App() {}' } },
    ],
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Transcript Import Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/transcript')
  })

  test('Files mode: upload screen accepts jsonl files', async ({ page }) => {
    const filePath = createTempFile(
      'session.jsonl',
      VALID_RECORDS.map(r => JSON.stringify(r)).join('\n'),
    )

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    await expect(page.getByText('1 file ready')).toBeVisible()

    fs.unlinkSync(filePath)
  })

  test('Zip mode: upload screen accepts .zip files', async ({ page }) => {
    // Switch to Zip mode
    await page.getByRole('radio', { name: 'Zip' }).click()

    // Create a valid .zip containing session.jsonl
    const jsonlContent = VALID_RECORDS.map(r => JSON.stringify(r)).join('\n')
    const zipBuffer = createMinimalZip(jsonlContent)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multiverse-e2e-zip-'))
    const zipPath = path.join(dir, 'transcripts.zip')
    fs.writeFileSync(zipPath, zipBuffer)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(zipPath)

    await expect(page.getByText('1 file ready')).toBeVisible()

    fs.unlinkSync(zipPath)
    fs.rmdirSync(dir)
  })

  test('Zip mode: corrupted zip shows error gracefully', async ({ page }) => {
    // Switch to Zip mode
    await page.getByRole('radio', { name: 'Zip' }).click()

    // Create a corrupted .zip file (just random bytes with .zip extension)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multiverse-e2e-zip-'))
    const zipPath = path.join(dir, 'corrupted.zip')
    fs.writeFileSync(zipPath, Buffer.from('not a real zip file'))

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(zipPath)

    // Fill in project name and try to import
    await page.getByPlaceholder('your-repo-name').fill('test-project')
    await page.getByRole('button', { name: 'Visualize' }).click()

    // Should show an error message rather than crashing
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 })

    fs.unlinkSync(zipPath)
    fs.rmdirSync(dir)
  })
})
