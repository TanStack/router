/**
 * Extracted-export outputs (`?tsr-split=export---Name`) an entry chunk of a
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
 * host, when there is something to fix (J2.8: the user is told, the build
 * goes on); one instance a module of the entry imports is as it should be.
 */
import { identify, normalizePath } from '../identity'
import { displayPath } from '../diagnostics'
import type { WarningLedger } from '../diagnostics'

interface EagerExtractedExport {
  /** The route file's path, with forward slashes. */
  file: string
  /** The export's name. */
  name: string
  /** The extracted module's id, as the bundler names it. */
  id: string
}

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
    const { path, derived } = identify(id)
    if (derived?.kind !== 'export') {
      continue
    }
    const file = normalizePath(path)
    const name = derived.value
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
function isSplitCode(id: string): boolean {
  const kind = identify(id).derived?.kind
  return kind === 'split' || kind === 'shared' || kind === 'hydrate'
}

/** The parts of a webpack/Rspack compilation the importer lookup reads. */
export interface WebpackModuleGraphLike {
  modules: Iterable<ModuleLike>
  moduleGraph: {
    getIncomingConnections: (module: ModuleLike) => Iterable<{
      originModule?: ModuleLike | null
      /** The importer before module concatenation (the original module, not the concatenated one holding it). */
      resolvedOriginModule?: ModuleLike | null
    }>
  }
}

/**
 * The importers of each extracted-export module of a webpack/Rspack
 * compilation, and of the route modules re-exporting them (`idOf` names a
 * module's resource the way `moduleIds` are named), for `warnEagerExports`.
 */
export function webpackImporters(
  compilation: WebpackModuleGraphLike,
  idOf: (resource: string) => string,
): (id: string) => Array<string> {
  const importers = new Map<string, Array<string>>()
  const resourceOf = (m: ModuleLike) => m.resource ?? m.identifier?.() ?? ''
  const modules = [...compilation.modules].flatMap((m) => [
    m,
    ...(m.modules ?? []),
  ])
  // the extracted modules, and the route modules re-exporting them
  const routeFiles = new Set<string>()
  for (const m of modules) {
    const { path, derived } = identify(resourceOf(m))
    if (derived?.kind === 'export') {
      routeFiles.add(path)
    }
  }
  if (routeFiles.size === 0) {
    return () => []
  }
  for (const m of modules) {
    const resource = resourceOf(m)
    const { path, derived } = identify(resource)
    if (
      derived?.kind !== 'export' &&
      !(derived === null && routeFiles.has(path))
    ) {
      continue
    }
    const list: Array<string> = []
    for (const c of compilation.moduleGraph.getIncomingConnections(m)) {
      // the module that imports, not a concatenated module holding it (Rspack
      // lists both; such a wrapper has no resource of its own)
      const from = c.resolvedOriginModule ?? c.originModule
      if (from?.resource) {
        list.push(idOf(from.resource))
      }
    }
    importers.set(idOf(resource), list)
  }
  return (id) => importers.get(id) ?? []
}

/**
 * Warns once per (route file, export) per run (`ledger`) of each extracted
 * export among `moduleIds`, the module ids of what a client build loads
 * with its entries (`rollupEntryModuleIds`, `initialChunkResources`), when
 * there is something to fix. `importersOf` (the bundler's module graph) of
 * the extracted module tells whether split code imports it (one instance)
 * or copies it, and of the route file who imports it through the route
 * file: a module loaded with the entry (the export is needed there: a
 * copied export then ships twice), another route's split code (webpack and
 * Rspack keep the route file's re-export), or nobody (the bundler's chunk
 * configuration placed it with the entry). `routeTree` is the generated
 * route tree, which imports every route file.
 */
export function warnEagerExports(
  moduleIds: Iterable<string>,
  bundler: 'rollup' | 'webpack',
  ledger: WarningLedger,
  warn: (message: string) => void,
  importersOf: (id: string) => Iterable<string>,
  where: { root?: string; routeTree?: string } = {},
): void {
  const ids = [...moduleIds]
  const exports = eagerExtractedExports(ids)
  if (exports.length === 0) {
    return
  }
  const eager = new Set(ids)
  const tree =
    where.routeTree === undefined ? null : normalizePath(where.routeTree)
  for (const e of exports) {
    const copied = ![...importersOf(e.id)].some(isSplitCode)
    let eagerImporter = false
    let otherImporter = false
    for (const importer of importersOf(e.file)) {
      const path = normalizePath(identify(importer).path)
      if (path === e.file || path === tree) {
        continue
      }
      if (eager.has(importer)) {
        eagerImporter = true
      } else {
        otherImporter = true
      }
    }
    const cause = eagerImporter
      ? copied
        ? 'copied'
        : null
      : bundler === 'webpack' && otherImporter
        ? 'reexport'
        : 'chunk'
    if (cause === null) {
      // one instance, which a module of the entry needs: as it should be
      continue
    }
    const message = eagerExportWarning(
      e,
      displayPath(e.file, where.root),
      cause,
    )
    if (ledger.once(e.file, { code: 'eager-export', message })) {
      warn(message)
    }
  }
}

/** The warning of an eager extracted export, by what keeps it with the entry. */
function eagerExportWarning(
  e: EagerExtractedExport,
  file: string,
  cause: 'copied' | 'reexport' | 'chunk',
): string {
  const head = `[tanstack-router] The export \`${e.name}\` of ${file}`
  switch (cause) {
    case 'copied':
      return `${head} is imported through the route file by a module that loads with the entry chunk, and the route's split code carries its own copy, so the build ships it twice. Move it to its own module and import it from there, in that module and in the route.`
    case 'reexport':
      return `${head} loads with the entry chunk: another route's split code imports it through the route file, and the bundler keeps the route file's re-export, which loads with the entry. Import it from its own module, or declare \`"sideEffects": false\` in package.json so the bundler can bypass the route file.`
    case 'chunk':
      return `${head} loads with the entry chunk, although only split code imports it: the bundler's chunk configuration groups its module with the entry (\`manualChunks\`, \`advancedChunks\`, \`splitChunks\`). Keep the routes directory out of chunk groups that load with the entry.`
  }
}
