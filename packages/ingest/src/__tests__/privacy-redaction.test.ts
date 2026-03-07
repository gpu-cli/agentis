// ============================================================================
// Privacy — Secret scrubbing + redaction tests (hq-gij.1.1)
// ============================================================================

import { describe, it, expect } from 'vitest'
import { scrubSecrets, DEFAULT_SECRET_PATTERNS } from '../browser/privacy'

describe('scrubSecrets', () => {
  it('scrubs generic API keys', () => {
    // Pattern: (sk|pk|api|key|token|secret|password|bearer|auth)[-_]?[A-Za-z0-9]{16,}
    // Needs 16+ consecutive alphanumeric chars after the prefix+optional separator
    const result = scrubSecrets('key: sk_abcdefghijklmnop1234')
    expect(result).toContain('[redacted-secret]')
    expect(result).not.toContain('sk_abcdef')
  })

  it('scrubs GitHub PATs', () => {
    const result = scrubSecrets('github token: ghp_123456789012345678901234567890123456')
    expect(result).toContain('[redacted-secret]')
    expect(result).not.toContain('ghp_')
  })

  it('scrubs Slack tokens', () => {
    const result = scrubSecrets('slack: xoxb-1234-5678-abcdef')
    expect(result).toContain('[redacted-secret]')
    expect(result).not.toContain('xoxb-')
  })

  it('scrubs PEM key markers', () => {
    const result = scrubSecrets('-----BEGIN RSA PRIVATE KEY-----')
    expect(result).toContain('[redacted-secret]')
    expect(result).not.toContain('BEGIN RSA')
  })

  it('scrubs JWT-like tokens', () => {
    const result = scrubSecrets('auth: eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3ODkwIn0')
    expect(result).toContain('[redacted-secret]')
    expect(result).not.toContain('eyJ')
  })

  it('passes safe text through unchanged', () => {
    expect(scrubSecrets('just normal text')).toBe('just normal text')
    expect(scrubSecrets('function foo() { return 42 }')).toBe('function foo() { return 42 }')
    expect(scrubSecrets('')).toBe('')
  })

  it('scrubs multiple secrets in a single string', () => {
    // Use patterns that definitely match: generic key + GitHub PAT
    const input = 'key1: token_abcdefghijklmnop1234 and key2: ghp_123456789012345678901234567890123456'
    const result = scrubSecrets(input)
    expect(result.match(/\[redacted-secret\]/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('handles text with no partial matches', () => {
    // Short strings that look like but aren't actually secrets
    expect(scrubSecrets('sk_short')).toBe('sk_short')
    expect(scrubSecrets('ghp_tooshort')).toBe('ghp_tooshort')
  })
})

describe('DEFAULT_SECRET_PATTERNS', () => {
  it('has patterns for all major secret types', () => {
    const names = DEFAULT_SECRET_PATTERNS.map(p => p.name)
    expect(names).toContain('generic-key')
    expect(names).toContain('github-pat')
    expect(names).toContain('slack-token')
    expect(names).toContain('pem-key')
    expect(names).toContain('jwt-like')
  })

  it('all patterns are valid regex', () => {
    for (const pattern of DEFAULT_SECRET_PATTERNS) {
      expect(() => new RegExp(pattern.expression)).not.toThrow()
    }
  })
})
