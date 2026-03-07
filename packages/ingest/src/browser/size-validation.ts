// ============================================================================
// File size validation for transcript uploads
// ============================================================================

export interface SizeValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/** Maximum compressed (zip) file size: 5MB */
export const MAX_COMPRESSED_SIZE = 5 * 1024 * 1024

/** Warning threshold for uncompressed content: 20MB */
export const MAX_UNCOMPRESSED_WARNING = 20 * 1024 * 1024

/** Maximum individual file size: 50MB (hard limit) */
export const MAX_SINGLE_FILE_SIZE = 50 * 1024 * 1024

/** Maximum total uploaded size (all files combined): 30MB (hard limit) */
export const MAX_TOTAL_UPLOAD_SIZE = 30 * 1024 * 1024

/** Maximum uncompressed content size: 40MB (hard limit) */
export const MAX_UNCOMPRESSED_HARD = 40 * 1024 * 1024

/**
 * Validate file sizes before parsing.
 * Returns errors for hard limits and warnings for soft limits.
 */
export function validateFileSize(files: File[]): SizeValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  let totalSize = 0

  for (const file of files) {
    // Check individual file size
    if (file.size > MAX_SINGLE_FILE_SIZE) {
      errors.push(
        `${file.name} exceeds maximum file size (${formatBytes(file.size)} > ${formatBytes(MAX_SINGLE_FILE_SIZE)})`,
      )
    }

    // Check compressed file size
    if (file.name.endsWith('.zip') && file.size > MAX_COMPRESSED_SIZE) {
      errors.push(
        `${file.name} exceeds compressed size limit (${formatBytes(file.size)} > ${formatBytes(MAX_COMPRESSED_SIZE)})`,
      )
    }

    totalSize += file.size
  }

  // Hard cap on total uploaded size
  if (totalSize > MAX_TOTAL_UPLOAD_SIZE) {
    errors.push(
      `Total upload size ${formatBytes(totalSize)} exceeds limit (${formatBytes(MAX_TOTAL_UPLOAD_SIZE)})`,
    )
  }

  // Check total uncompressed size warning
  if (totalSize > MAX_UNCOMPRESSED_WARNING) {
    warnings.push(
      `Total file size is ${formatBytes(totalSize)} — parsing may be slow or run out of memory`,
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validate uncompressed content size after extraction.
 */
export function validateUncompressedSize(totalBytes: number): SizeValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (totalBytes > MAX_UNCOMPRESSED_HARD) {
    errors.push(
      `Uncompressed content ${formatBytes(totalBytes)} exceeds limit (${formatBytes(MAX_UNCOMPRESSED_HARD)})`,
    )
  }

  if (totalBytes > MAX_UNCOMPRESSED_WARNING) {
    warnings.push(
      `Uncompressed content is ${formatBytes(totalBytes)} — parsing may be slow`,
    )
  }

  return { valid: errors.length === 0, errors, warnings }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
