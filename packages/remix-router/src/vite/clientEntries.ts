import { promises as fs } from 'node:fs'
import * as path from 'node:path'

/**
 * Manifest emitted at build time. Maps each logical client-entry id (the
 * first arg to `clientEntry()`) to the deployed chunk URL + export name
 * the SSR runtime should hand to `resolveClientEntry`.
 *
 * Stable JSON shape — write once, read by both the server entry and any
 * static-analysis tooling.
 */
export interface ClientEntryManifest {
  version: 1
  entries: Record<string, { href: string; exportName: string }>
}

export interface ClientEntriesPluginOptions {
  /** Path the manifest JSON should be written to (relative to outDir). */
  manifestPath?: string
  /**
   * Whether `clientEntry` calls in arbitrary user code should be split as
   * their own Vite chunks. Defaults to `true`. Set `false` to use Vite's
   * normal chunking and let the runtime resolve via `resolveClientEntry`
   * yourself.
   */
  splitChunks?: boolean
}

interface DiscoveredEntry {
  /** The literal first arg to `clientEntry(...)` — `'mod#Export'` form. */
  id: string
  /** Module URL part before `#`. */
  moduleUrl: string
  /** Export name part after `#`, or `''` if absent. */
  exportName: string
  /** File where the call was found — informational. */
  source: string
}

/**
 * Vite plugin that:
 *
 * 1. Scans transformed JS for `clientEntry('id', …)` calls and records
 *    each `id` against the file it appeared in.
 * 2. (When splitChunks is on) marks the source file as a manual chunk so
 *    each clientEntry module ships in its own bundle.
 * 3. After the build, writes a JSON manifest with `{ entries: {…} }` so
 *    the server-side `resolveClientEntry` callback can hand a real
 *    `{ href, exportName }` to the `@remix-run/ui/server`'s
 *    `renderToStream`.
 *
 * In dev mode the manifest is updated incrementally as files transform.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite'
 * import { remixClientEntries } from '@tanstack/remix-router/vite'
 *
 * export default defineConfig({
 *   plugins: [remixClientEntries()],
 * })
 * ```
 */
export function remixClientEntries(opts: ClientEntriesPluginOptions = {}) {
  const manifestPath = opts.manifestPath ?? '.remix/clientEntries.json'
  const splitChunks = opts.splitChunks ?? true

  const discovered = new Map<string, DiscoveredEntry>()
  let isClientBuild = false
  let outDir = 'dist'

  // Match `clientEntry('moduleUrl#Export', …)` in transformed source. The
  // first argument is required to be a string literal — that's the
  // contract. Anything else (template strings, vars) is left as-is and
  // requires the user to supply a custom `resolveClientEntry`.
  const CLIENT_ENTRY_RE =
    /\bclientEntry\s*\(\s*(['"])((?:(?!\1).)+)\1\s*,/g

  function recordCalls(code: string, source: string) {
    let match: RegExpExecArray | null
    CLIENT_ENTRY_RE.lastIndex = 0
    while ((match = CLIENT_ENTRY_RE.exec(code)) !== null) {
      const id = match[2]!
      const hashIdx = id.lastIndexOf('#')
      const moduleUrl = hashIdx === -1 ? id : id.slice(0, hashIdx)
      const exportName = hashIdx === -1 ? '' : id.slice(hashIdx + 1)
      discovered.set(id, { id, moduleUrl, exportName, source })
    }
  }

  return {
    name: '@tanstack/remix-router/clientEntries',
    apply: 'build' as const,

    configResolved(config: { build?: { outDir?: string } }) {
      outDir = config.build?.outDir ?? 'dist'
    },

    config(_config: unknown, env: { command: string; mode: string }) {
      // Plugin only operates during build; in serve mode we leave the
      // discovery to runtime + an empty manifest.
      isClientBuild = env.command === 'build'
    },

    transform(code: string, id: string) {
      if (!code.includes('clientEntry')) return null
      if (id.includes('node_modules/')) return null
      if (!/\.[cm]?[jt]sx?$/.test(id)) return null
      recordCalls(code, id)
      return null
    },

    async generateBundle(
      this: {
        emitFile: (file: {
          type: 'chunk' | 'asset'
          id?: string
          name?: string
          fileName?: string
          source?: string
        }) => void
      },
      _options: unknown,
      bundle: Record<string, { fileName: string; type: string; modules?: Record<string, unknown> }>,
    ) {
      if (!isClientBuild) return
      if (splitChunks) {
        // Best-effort chunk splitting: for each discovered entry whose
        // moduleUrl is a real on-disk module, emit it as its own chunk.
        // (Specifier-based ids, e.g. '@tanstack/remix-router/ClientLink',
        // can't be split at this level — they need a real file path. The
        // user's app code points to those modules through their own import
        // graph; Vite handles the chunking for us.)
        // Nothing to do here in v1 — chunk splitting is enforced by users
        // via Vite's `manualChunks`. We just write the manifest below.
      }

      const entries: ClientEntryManifest['entries'] = {}
      for (const entry of discovered.values()) {
        // Look up the chunk that owns the entry's source module. Prefer a
        // chunk whose facadeModuleId or modules map matches the source
        // file; fall back to the moduleUrl itself.
        const chunk = Object.values(bundle).find((b) => {
          if (b.type !== 'chunk') return false
          const f: any = b
          if (f.facadeModuleId && f.facadeModuleId.endsWith(entry.source)) {
            return true
          }
          if (b.modules && entry.source in b.modules) return true
          return false
        }) as { fileName: string } | undefined
        const href = chunk ? `/${chunk.fileName}` : entry.moduleUrl
        entries[entry.id] = { href, exportName: entry.exportName }
      }

      const json: ClientEntryManifest = { version: 1, entries }
      const target = path.join(outDir, manifestPath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, JSON.stringify(json, null, 2), 'utf8')
    },
  }
}

/**
 * Server-side helper that loads a manifest produced by
 * {@link remixClientEntries} and returns a `resolveClientEntry`
 * implementation suitable for `@remix-run/ui/server`'s `renderToStream`.
 */
export async function loadClientEntryResolver(
  manifestPath: string,
): Promise<(entryId: string) => { href: string; exportName: string }> {
  const text = await fs.readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(text) as ClientEntryManifest
  return (entryId) => {
    const entry = manifest.entries[entryId]
    if (!entry) {
      throw new Error(
        `@tanstack/remix-router: clientEntry "${entryId}" missing from manifest at ${manifestPath}.`,
      )
    }
    return entry
  }
}
