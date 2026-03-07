// ============================================================================
// Browser-safe hashing via crypto.subtle (no node:crypto)
// ============================================================================

/**
 * Compute SHA-256 hash of a string value using the Web Crypto API.
 * Returns a hex-encoded hash string with `sha256:` prefix.
 */
export async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

/**
 * Synchronous deterministic hash for use in ID generation.
 * Uses DJB2 variant — fast, no crypto dependency, deterministic.
 * Returns a 12-character hex digest.
 */
export function deterministicId(prefix: string, value: string): string {
  const digest = djb2Hex(value)
  return `${prefix}_${digest}`
}

/**
 * DJB2 hash function producing a 12-char hex string.
 * Not cryptographic — used only for deterministic ID generation.
 */
function djb2Hex(value: string): string {
  let h1 = 5381
  let h2 = 52711
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i)
    h1 = ((h1 << 5) + h1 + ch) | 0
    h2 = ((h2 << 5) + h2 + ch) | 0
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0')
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0')
  return (hex1 + hex2).slice(0, 12)
}
