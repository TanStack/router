/**
 * Extracted-export outputs (`?tsr-split=export~Name`) an entry chunk of a
 * client build holds. A route's own chunks never import such a module (they
 * copy the binding, `reach.ts`): one reaches the entry only when a module
 * loaded with the entry imports the binding through the route file (Rollup
 * and Rolldown), or when any module imports it through the route file and
 * the bundler cannot bypass the route module's re-export (webpack and
 * Rspack without `"sideEffects": false`). The export is then eager and the
 * route's chunk carries its copy: the build warns once per (file, export),
 * in every host (J2.8: the user is told, the build goes on).
 */
import { identify } from './identity'

export interface EagerExtractedExport {
  /** The route file's path, with forward slashes. */
  file: string
  /** The export's name. */
  name: string
}

const EXTRACTED_EXPORT_RE = /[?&]tsr-split=export~([^&#]+)/

/**
 * The extracted exports among `moduleIds` (the module ids of the chunks a
 * build loads with its entries), once each, in first-seen order. Ids are
 * the bundler's (a webpack resource with its query; a Rollup module id).
 */
export function eagerExtractedExports(
  moduleIds: Iterable<string>,
): Array<EagerExtractedExport> {
  const seen = new Set<string>()
  const out: Array<EagerExtractedExport> = []
  for (const id of moduleIds) {
    const match = EXTRACTED_EXPORT_RE.exec(id)
    if (!match) {
      continue
    }
    const file = identify(id).path.replace(/\\/g, '/')
    const name = decodeURIComponent(match[1]!)
    const key = `${file}\0${name}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push({ file, name })
  }
  return out
}

/** The parts of a Rollup/Rolldown output chunk the entry walk reads. */
export interface OutputChunkLike {
  type: string
  fileName: string
  isEntry: boolean
  /** Chunks this chunk imports statically (and externals, which are no chunk). */
  imports: ReadonlyArray<string>
  modules: Record<string, unknown>
}

/**
 * The module ids of the entry chunks of a Rollup/Rolldown bundle and of the
 * chunks they import statically, transitively (what loads with the entry).
 */
export function rollupEntryModuleIds(
  bundle: Record<string, OutputChunkLike | { type: string }>,
): Array<string> {
  const chunks = Object.values(bundle).filter(
    (c): c is OutputChunkLike => c.type === 'chunk',
  )
  const byName = new Map(chunks.map((c) => [c.fileName, c]))
  const eager = new Set<string>()
  const queue = chunks.filter((c) => c.isEntry).map((c) => c.fileName)
  while (queue.length > 0) {
    const name = queue.pop()!
    const chunk = byName.get(name)
    if (!chunk || eager.has(name)) {
      continue
    }
    eager.add(name)
    queue.push(...chunk.imports)
  }
  const ids: Array<string> = []
  for (const name of eager) {
    ids.push(...Object.keys(byName.get(name)!.modules))
  }
  return ids
}

/** The parts of a webpack/Rspack compilation the initial-chunk walk reads. */
export interface InitialChunksLike {
  chunks: Iterable<{ canBeInitial: () => boolean }>
  chunkGraph: { getChunkModules: (chunk: unknown) => Array<ModuleLike> }
}

export interface ModuleLike {
  resource?: string
  /** Inner modules of a concatenated module. */
  modules?: Array<ModuleLike>
  identifier?: () => string
}

/**
 * The resources of the modules of a webpack/Rspack compilation's initial
 * chunks (concatenated modules' inner modules included), as the bundler
 * names them.
 */
export function initialChunkResources(
  compilation: InitialChunksLike,
): Array<string> {
  const out: Array<string> = []
  for (const chunk of compilation.chunks) {
    if (!chunk.canBeInitial()) {
      continue
    }
    for (const m of compilation.chunkGraph.getChunkModules(chunk)) {
      for (const inner of [m, ...(m.modules ?? [])]) {
        out.push(inner.resource ?? inner.identifier?.() ?? '')
      }
    }
  }
  return out
}

/**
 * The warning of an eager extracted export. The webpack family can bypass
 * the route module's re-export only for a side-effect-free package: its
 * message says so.
 */
export function eagerExportWarning(
  e: EagerExtractedExport,
  bundler: 'rollup' | 'webpack',
): string {
  const share =
    bundler === 'webpack'
      ? 'Move it to its own module and import it from there, or declare "sideEffects": false in package.json so the bundler can bypass the route file, so the importer and the route share one instance.'
      : 'Move it to its own module and import it from there, so the importer and the route share one instance.'
  return `[tanstack-router] The export \`${e.name}\` of "${e.file}" loads with the entry chunk: another module imports it through the route file, so the bundler keeps it with the route module, while the route's own chunk carries its copy. ${share}`
}
