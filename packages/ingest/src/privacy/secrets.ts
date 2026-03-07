export interface SecretPattern {
  name: string
  expression: RegExp
}

export const DEFAULT_SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'generic-key',
    expression: /(?:sk|pk|api|key|token|secret|password|bearer|auth)[-_]?[A-Za-z0-9]{16,}/giu,
  },
  {
    name: 'github-pat',
    expression: /ghp_[A-Za-z0-9]{36}/gu,
  },
  {
    name: 'slack-token',
    expression: /xoxb-[A-Za-z0-9-]+/gu,
  },
  {
    name: 'pem-key',
    expression: /-----BEGIN [A-Z ]+ KEY-----/gu,
  },
  {
    name: 'jwt-like',
    expression: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gu,
  },
]

export function scrubSecrets(input: string): string {
  let output = input
  for (const pattern of DEFAULT_SECRET_PATTERNS) {
    output = output.replace(pattern.expression, '[redacted-secret]')
  }
  return output
}
