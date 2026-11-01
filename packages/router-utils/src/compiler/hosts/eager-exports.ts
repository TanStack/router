/**
 * Extracted-export outputs (`?tsr-split=export~Name`) an entry chunk of a
 * client build holds. A route's own chunks copy an export whose closure is
 * functions and primitives instead of importing its module, and import one
 * with an identity or state from it (`placement/settle.ts`): the module
 * reaches the entry when a module loaded with the entry imports the binding
 * through the route file (Rollup and Rolldown), when any module imports it
 * through the route file and the bundler cannot bypass the route module's
 * re-export (webpack and Rspack without `"sideEffects": false`), or, for an
 * export the chunks import, when the bundler's chunk assignment merges a
 * module the entry re-exports and a chunk imports into the entry (Rolldown
 * < 1.1.5, a user `manualChunks` group merging into the entry). The export
 * is then eager: the build warns once per (file, export) per run, in every
 * host (J2.8: the user is told, the build goes on).
 */
import { identify, normalizePath } from '../identity'
import type { WarningLedger } from '../diagnostics'

interface EagerExtractedExport {
  /** The route file's path, with forward slashes. */
  file: string
  /** The export's name. */
  name: string
  /** The extracted module's id, as the bundler names it. */
  id: string
}

const EXTRACTED_EXPORT_RE = /[?&]tsr-split=export~([^&#]+)/

/**
 * The extracted exports among `moduleIds` (the module ids of the chunks a
 * build loads with its entries), once each, in first-seen order. Ids are
 * the bundler's (a webpack resource with its query; a Rollup module id).
 */
function eagerExtractedExports(
  moduleIds: Iterable<string>,
): Array<EagerExtractedExport> {
  const seen = new Set<string>()
  const out: Array<EagerExtractedExport> = []
  for (const id of moduleIds) {
    const match = EXTRACTED_EXPORT_RE.exec(id)
    if (!match) {
      continue
    }
    const file = normalizePath(identify(id).path)
    const name = decodeURIComponent(match[1]!)
    const key = `${file}\0${name}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push({ file, name, id })
  }
  return out
}

/** The parts of a Rollup/Rolldown output chunk the entry walk reads. */
interface OutputChunkLike {
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

interface ModuleLike {
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

/** A module id of split code (a split chunk, a Hydrate chunk): an importer of an extracted module the chunk imports instead of copying. */
const SPLIT_IMPORTER_RE = /[?&](tsr-split=(?!export~)|tss-hydrate=)/

/** The parts of a webpack/Rspack compilation the importer lookup reads. */
export interface WebpackModuleGraphLike {
  modules: Iterable<ModuleLike>
  moduleGraph: {
    getIncomingConnections: (
      module: ModuleLike,
    ) => Iterable<{ originModule?: ModuleLike | null }>
  }
}

/**
 * The importers of each extracted-export module of a webpack/Rspack
 * compilation (`idOf` names a module's resource the way `moduleIds` are
 * named), for `warnEagerExports`.
 */
export function webpackImporters(
  compilation: WebpackModuleGraphLike,
  idOf: (resource: string) => string,
): (id: string) => Array<string> {
  const importers = new Map<string, Array<string>>()
  const resourceOf = (m: ModuleLike) => m.resource ?? m.identifier?.() ?? ''
  for (const m of compilation.modules) {
    for (const inner of [m, ...(m.modules ?? [])]) {
      const resource = resourceOf(inner)
      if (!EXTRACTED_EXPORT_RE.test(resource)) {
        continue
      }
      const list: Array<string> = []
      for (const c of compilation.moduleGraph.getIncomingConnections(inner)) {
        const origin = c.originModule ? resourceOf(c.originModule) : ''
        if (origin !== '') {
          list.push(idOf(origin))
        }
      }
      importers.set(idOf(resource), list)
    }
  }
  return (id) => importers.get(id) ?? []
}

/**
 * Warns once per (route file, export) per run (`ledger`) of each extracted
 * export among `moduleIds`: the module ids of what a client build loads
 * with its entries (`rollupEntryModuleIds`, `initialChunkResources`).
 * `importersOf` (the bundler's module graph) tells the two causes apart:
 * split code importing the module (the export is not copied) under a chunk
 * configuration that placed it with the entry, or another module importing
 * the binding through the route file.
 */
export function warnEagerExports(
  moduleIds: Iterable<string>,
  bundler: 'rollup' | 'webpack',
  ledger: WarningLedger,
  warn: (message: string) => void,
  importersOf?: (id: string) => Iterable<string>,
): void {
  for (const e of eagerExtractedExports(moduleIds)) {
    const cause =
      importersOf === undefined
        ? 'unknown'
        : [...importersOf(e.id)].some((i) => SPLIT_IMPORTER_RE.test(i))
          ? 'chunk'
          : 'importer'
    const message = eagerExportWarning(e, bundler, cause)
    if (ledger.once(e.file, { code: 'eager-export', message })) {
      warn(message)
    }
  }
}

/**
 * The warning of an eager extracted export. The webpack family can bypass
 * the route module's re-export only for a side-effect-free package: its
 * message says so.
 */
function eagerExportWarning(
  e: EagerExtractedExport,
  bundler: 'rollup' | 'webpack',
  cause: 'chunk' | 'importer' | 'unknown',
): string {
  const share =
    bundler === 'webpack'
      ? 'Move it to its own module and import it from there, or declare "sideEffects": false in package.json so the bundler can bypass the route file, so the importer and the route share one instance.'
      : 'Move it to its own module and import it from there, so the importer and the route share one instance.'
  const head = `[tanstack-router] The export \`${e.name}\` of "${e.file}" loads with the entry chunk:`
  switch (cause) {
    case 'chunk':
      return `${head} the route's split code imports it (a class, an object, a call result or a written binding exists once, so the chunk cannot carry a copy) and the bundler's chunk configuration placed its module with the entry. Keep the routes directory out of chunk groups that load with the entry, or move the export to its own module and import it from there.`
    case 'importer':
      return `${head} another module imports it through the route file, so the bundler keeps it with the route module instead of leaving it to the split code that needs it. ${share}`
    default:
      return `${head} another module imports it through the route file, or the bundler's chunk configuration placed the module the route's split code imports with the entry (a class, an object, a call result or a written binding exists once, so the chunk cannot carry a copy). ${share}`
  }
}
