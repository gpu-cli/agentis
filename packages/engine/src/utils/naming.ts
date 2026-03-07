// ============================================================================
// Naming Utilities — Derive user-friendly display names from paths/identifiers
// ============================================================================

/**
 * Convert a file path or route-style building name into a friendly display name.
 *
 * Examples:
 *   "src/auth"            → "Auth"
 *   "src/routes"          → "Routes"
 *   "docs/"               → "Docs"
 *   "infra/"              → "Infra"
 *   "docs/architecture"   → "Architecture"
 *   "src/service"         → "Service"
 *   "lib/utils/helpers"   → "Helpers"
 *   "my-cool-module"      → "My Cool Module"
 */
export function friendlyBuildingName(rawName: string): string {
  // Strip trailing slashes
  let name = rawName.replace(/\/+$/, '')

  // Take the last path segment (the most specific part)
  const segments = name.split('/')
  name = segments[segments.length - 1] ?? name

  // Strip common prefixes that are just noise
  name = name.replace(/^(src|lib|pkg|packages|app|apps)$/i, name)

  // Convert kebab-case and snake_case to Title Case
  name = name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return name
}

/**
 * Get the full file path from a building's external_ref, falling back to name.
 */
export function buildingFilePath(
  externalRef?: { source: string; source_id: string },
  name?: string,
): string {
  if (externalRef?.source_id) {
    // Strip trailing slashes from path too
    return externalRef.source_id.replace(/\/+$/, '')
  }
  return name?.replace(/\/+$/, '') ?? 'Unknown'
}

/**
 * Construct a URL for the building's directory based on its external_ref.
 * Returns null if no valid URL can be constructed.
 */
export function buildingDirectoryUrl(
  externalRef?: { source: string; source_id: string },
): string | null {
  if (!externalRef) return null
  if (externalRef.source === 'github') {
    return `https://github.com/${externalRef.source_id}`
  }
  return null
}

/**
 * Construct a URL for the building's source repository/resource.
 */
export function buildingSourceUrl(
  externalRef?: { source: string; source_id: string },
): string | null {
  if (!externalRef) return null
  if (externalRef.source === 'github') {
    return `https://github.com/${externalRef.source_id}`
  }
  return null
}
