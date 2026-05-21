import type { RouterManagedTag, ScriptFilter } from '@tanstack/router-core'

const CLIENT_ENTRY_MARKER_ATTR = 'data-tsr-client-entry'
const LEGACY_CLIENT_ENTRY_ID = 'virtual:tanstack-start-client-entry'
const TRAILING_IMPORT_RE = /(?:^|[;\n])\s*import\((['"]).*?\1\)\s*;?\s*$/s

/**
 * Identifies the client-entry script tag emitted by start-server-core's
 * `buildClientEntryScriptTag`. When a route opts out via `hydrate: false`,
 * framework `<Scripts />` renderers strip the tag's trailing
 * `import(<clientEntry>)` (and skip the tag entirely if nothing else is in it)
 * so the page renders SSR HTML without booting the client framework.
 *
 * Any injected prelude (e.g. React Refresh setup for HMR) is preserved; only
 * the trailing dynamic import of the client entry is removed.
 */
export function isClientEntryScript(script: RouterManagedTag): boolean {
  if (script.tag !== 'script') {
    return false
  }

  const marker = script.attrs?.[CLIENT_ENTRY_MARKER_ATTR]
  if (marker === true || marker === 'true') {
    return true
  }

  if (typeof script.children !== 'string') {
    return false
  }

  return script.children.includes(LEGACY_CLIENT_ENTRY_ID)
}

/**
 * Returns the script tag with the client-entry import removed, or `null` when
 * the tag has nothing left after stripping.
 *
 * Returns the tag unchanged when it isn't a client-entry script.
 */
export function stripClientEntryImport(
  script: RouterManagedTag,
): RouterManagedTag | null {
  if (!isClientEntryScript(script)) {
    return script
  }

  if (typeof script.children !== 'string') {
    return null
  }

  const withoutImport = script.children.replace(TRAILING_IMPORT_RE, '').trim()

  if (withoutImport.length > 0) {
    return {
      ...script,
      children: withoutImport,
    }
  }

  if (script.children.includes(LEGACY_CLIENT_ENTRY_ID)) {
    const withoutLegacyImport = script.children
      .split('\n')
      .filter((line) => !line.includes(LEGACY_CLIENT_ENTRY_ID))
      .join('\n')
      .trim()

    if (withoutLegacyImport.length > 0) {
      return {
        ...script,
        children: withoutLegacyImport,
      }
    }
  }

  return null
}

/**
 * Default `scriptFilter` for adapter `<Scripts />`. When the matched route
 * tree opts out of hydration, drops the client-entry import so the page
 * renders without booting the client framework. Otherwise leaves the script
 * unchanged. TanStack Start auto-registers this filter; router-only consumers
 * can opt in by passing it as `createRouter({ scriptFilter })`.
 */
export const clientEntryScriptFilter: ScriptFilter = (
  script,
  { shouldHydrate },
) => (shouldHydrate ? script : stripClientEntryImport(script))
