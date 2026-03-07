import type { UniversalPrivacy } from '@multiverse/shared'

export function buildPrivacyManifest(
  input: UniversalPrivacy,
): UniversalPrivacy {
  return {
    policy: input.policy,
    redactions: {
      ...input.redactions,
      redactedEventCount: input.redactions.redactedEventCount ?? 0,
      redactedFieldCount: input.redactions.redactedFieldCount ?? 0,
      hashAlgorithm: input.redactions.hashAlgorithm ?? 'sha256',
      hashSalted: input.redactions.hashSalted ?? true,
      absolutePathsRedacted: input.redactions.absolutePathsRedacted ?? true,
      actorNamesPseudonymized: input.redactions.actorNamesPseudonymized ?? true,
    },
  }
}
