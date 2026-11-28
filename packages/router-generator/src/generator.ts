import path from 'node:path'
import crypto from 'node:crypto'
import * as fsp from 'node:fs/promises'
import { logging } from './logger'
import {
  isVirtualConfigFile,
  listsEntryNamed,
} from './filesystem/physical/getRouteNodes'
import { rootPathId } from './filesystem/physical/rootPathId'
import { scanRoutes } from './filesystem/scan'
import { replaceBackslash } from './utils'
import { RouteGenerationError, displayFile } from './errors'
import { analyzeRouteFile } from './analyze/route-file'
import { routerPackageOf, scaffoldRouteFile } from './scaffold/templates'
import { buildTreeModel, checkRouteFullPathUniqueness } from './model/build'
import { importedFiles, printTree } from './print/tree'
import { styleOf } from './print/style'
import { formatWithPrettier } from './print/format'
import {
  AtomicPublisher,
  ConcurrentEditError,
  readIfExists,
} from './publish/atomic'
import { validateRouteParams } from './validate-route-params'
import { routeOptionPieces } from './types'
import type { FileDiagnostic } from './analyze/route-file'
import type { ScanResult } from './filesystem/scan'
import type { GeneratorPlugin } from './plugin/types'
import type { CodeStyle } from './print/style'
import type {
  FsRouteType,
  GetRoutesByFileMapResult,
  GetRoutesByFileMapResultValue,
  RouteNode,
  RouteProps,
  TreeModel,
} from './types'
import type { Config } from './config'
import type { WrittenFile } from './publish/atomic'
import type { Logger } from './logger'

export type FileEventType = 'create' | 'update' | 'delete'
export type FileEvent = {
  type: FileEventType
  path: string
}
/**
 * A file event; `rerun` regenerates everything; `build` too, for a run that
 * does not watch: a route file that does not parse fails it, even one whose
 * route an earlier read knows (R86).
 */
export type GeneratorEvent = FileEvent | { type: 'rerun' } | { type: 'build' }

/**
 * What a route file contributes to the tree, from its last analysis that
 * parsed (a file saved mid-edit keeps the facts of its last parse until it
 * parses again).
 */
type FileFacts =
  | { included: false }
  | {
      included: true
      props: RouteProps | undefined
      /** `Route` is the router package's route constructor call of the file's kind (`RouteFileAnalysis.foreign` false). */
      routerConstructor: boolean
    }

/** A file's modification time and size, to tell it unchanged without reading it. */
interface FileStamp {
  readonly mtimeMs: number
  readonly size: number
}

/**
 * A text's digest, to tell it unchanged without keeping it: the form of
 * `Generator.sourceDigest` and `treeDigest` (a bundler plugin digests the
 * bytes its compiler was handed with it to compare them).
 */
export function contentDigest(content: string): string {
  return crypto.hash('sha1', content, 'base64')
}

const digestOf = contentDigest

interface FileState {
  /** The digest of the content last read (or written by the generator); `''` when the file was missing. */
  readonly digest: string
  readonly stamp?: FileStamp
  /**
   * What the file's upkeep writes (a scaffold, an id or constructor fix),
   * over the content it was made from: written only while the route tree
   * imports the file and the file still holds that content. A file the tree
   * leaves out is never edited.
   */
  readonly pending?: { readonly content: string; readonly over: string }
  /** The facts of the file as its upkeep leaves it. */
  readonly facts: FileFacts
  /**
   * The route the file was kept up for (`roleOf`): a file is analysed again
   * when the scan gives it another route, its content unchanged (SPEC J1.1).
   */
  readonly role: string
  /**
   * The file's real path, when it is not the scanned one (a symlinked file
   * or root): bundlers resolve modules to it, so the registry lists the file
   * under both.
   */
  readonly realPath?: string
  /** Why the content does not parse (`facts` are those of its last good content). */
  readonly unparsable?: string
}

/** A route of the registry: a scanned route file the tree's generation included. */
interface RegistryRoute {
  readonly file: string
  readonly routeId: string
  readonly kind: GetRoutesByFileMapResultValue['kind']
}

/**
 * What the generator publishes, all of it from one batch: the route tree of
 * its last generation and what readers ask of it. A batch builds the next
 * one once its writes are done, then installs it in one assignment, then
 * tells the plugins (a failed batch too: the routes and tree stay those of
 * the last generation, with what their files say now).
 */
interface Generation {
  /** The tree model of the last generation; undefined before the first. */
  readonly model: TreeModel | undefined
  /**
   * The route tree as that generation published it, to tell an external
   * change of it (`printed`: the text Prettier formatted into `content`,
   * when it did).
   */
  readonly tree:
    | {
        readonly content: string
        readonly digest: string
        readonly mtimeMs: number
        readonly size: number
        readonly printed?: string
      }
    | undefined
  /** The registry's routes: those of the scan the model was built from. */
  readonly routes: ReadonlyArray<RegistryRoute>
  readonly routesByFile: GetRoutesByFileMapResult
  /** The digest of each file the tree imports (`sourceDigest`), by its path and by its real path. */
  readonly digests: ReadonlyMap<string, string>
  /** The batch failed: the next one scans again and rebuilds the tree. */
  readonly failure: { readonly error: unknown } | undefined
}

/**
 * Adds each linked file's entry under its real path too (the module id
 * bundlers give it): a real path that is the path of an entry is that
 * entry's, else the first link's.
 */
function withRealPaths<T>(
  map: Map<string, T>,
  links: Array<readonly [realPath: string, value: T]>,
): Map<string, T> {
  for (const [realPath, value] of links) {
    if (!map.has(realPath)) {
      map.set(realPath, value)
    }
  }
  return map
}

function sameRegistry(
  a: GetRoutesByFileMapResult,
  b: GetRoutesByFileMapResult,
) {
  if (a.size !== b.size) {
    return false
  }
  for (const [file, value] of a) {
    const other = b.get(file)
    if (
      other?.routeId !== value.routeId ||
      other.kind !== value.kind ||
      other.routerConstructor !== value.routerConstructor
    ) {
      return false
    }
  }
  return true
}

/** What the analysis of a file's content records (`pending`: the text its upkeep writes over it). */
type ContentFacts = Pick<FileState, 'facts' | 'unparsable'> & {
  readonly pending?: string
}

/** What a file's analysis depends on besides its content. */
function roleOf(node: RouteNode, isRoot: boolean) {
  return `${isRoot ? 'root' : node._fsRouteType}:${node.routePath ?? ''}`
}

/**
 * `TSR_COMPILER_STATS=1` (measurement aid): registers the generator's
 * per-file facts in the process-global registry `compilerStats()` of
 * `@tanstack/router-utils/compiler` reads (held through a `WeakRef`).
 */
function registerStats(
  generator: Generator,
  read: (g: Generator) => Record<string, number>,
): void {
  const g = globalThis as Record<symbol, unknown>
  const key = Symbol.for('tanstack.compiler.stats')
  const registry = (g[key] ??= []) as Array<unknown>
  registry.push({
    label: 'router-generator',
    owner: new WeakRef(generator),
    read,
  })
}

async function stampOf(file: string): Promise<FileStamp | null> {
  try {
    const { mtimeMs, size } = await fsp.stat(file)
    return { mtimeMs, size }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * A file's real path when it is not the file's own path (a symlinked file,
 * or one under a linked directory): the module id bundlers give it.
 */
async function linkedRealPath(file: string): Promise<string | undefined> {
  const real = replaceBackslash(await fsp.realpath(file).catch(() => file))
  return real === file ? undefined : real
}

const pieceTypes: ReadonlyArray<FsRouteType> = routeOptionPieces

const routeFileExtension = /\.(tsx|ts|jsx|js|vue)$/

/** The files of a scan: the root route's and every route file's, once each. */
function filesOf(scan: ScanResult) {
  return [
    scan.rootRouteNode,
    ...scan.routeNodes.filter(
      (node) => !node.isVirtual && !node.isVirtualParentRoute,
    ),
  ]
}

/** A path as the scan spells it: absolute, `/`-separated. */
function normalize(file: string) {
  return replaceBackslash(path.resolve(file))
}

function isUnder(file: string, dir: string) {
  return file.startsWith(dir.endsWith('/') ? dir : `${dir}/`)
}

function sameProps(a: RouteProps | undefined, b: RouteProps | undefined) {
  if (!a || !b) {
    return a === b
  }
  return (
    a.unknown === b.unknown &&
    a.known.size === b.known.size &&
    [...a.known].every((name) => b.known.has(name))
  )
}

/** A route file no earlier read of the generator knows does not parse: it fails a build that does not watch (R86). */
class UnparsableRouteFileError extends RouteGenerationError {}
UnparsableRouteFileError.prototype.name = 'UnparsableRouteFileError'

function formatDiagnostic(file: string, diagnostic: FileDiagnostic) {
  const position =
    diagnostic.line === undefined
      ? ''
      : `:${diagnostic.line}:${diagnostic.column ?? 1}`
  return `${file}${position}: ${diagnostic.message}`
}

/**
 * The route generator of one app: keeps its route files up and its route
 * tree generated. Events (`run(event)`) are queued and drained by one loop,
 * a batch at a time, so events that arrive together are handled together
 * and none is lost (SPEC J1.10). A batch that changes the routes or their
 * props rebuilds the tree model from the scan and the facts of each route
 * file, which are kept by path and replaced whenever the file's content
 * changes; no generation builds on an earlier model (no route node outlives
 * a generation). The last published model stays for `getTreeModel`, plugins
 * and the batches that leave the routes as they were.
 */
export class Generator {
  public config: Config
  private readonly root: string
  private readonly logger: Logger
  private readonly plugins: ReadonlyArray<GeneratorPlugin>
  private readonly style: CodeStyle
  private readonly routerPackage: string
  private readonly treeFile: string
  /** The route tree file as event paths spell it. */
  private readonly treeKey: string
  private readonly routesDirectory: string
  private readonly virtualConfigFile: string | undefined
  /** Whether a physical scan lists an entry of this name (the ignore rules). */
  private readonly listed: (name: string) => boolean
  private readonly publisher: AtomicPublisher
  private readonly onWrite: ((written: WrittenFile) => void) | undefined

  private scan: ScanResult | undefined
  /** The route files of the last scan (a file a failed read left out of `files` is still known). */
  private scanned = new Set<string>()
  private readonly files = new Map<string, FileState>()
  private generation: Generation = {
    model: undefined,
    tree: undefined,
    routes: [],
    routesByFile: new Map(),
    digests: new Map(),
    failure: undefined,
  }

  private queue: Array<GeneratorEvent> = []
  /** The runs waiting for the drain; a `build` one makes each batch until it settles a build. */
  private waiters: Array<{
    resolve: () => void
    reject: (error: unknown) => void
    build: boolean
  }> = []
  private draining: Promise<void> | undefined
  /** `retire()`: another generator writes these files now. */
  private retired = false

  constructor(opts: {
    config: Config
    root: string
    /**
     * Where the generator's messages go (default: the console, unless
     * `disableLogging`): a host printing each warning once per build passes
     * its own.
     */
    logger?: Logger
    /**
     * Told of each file the generator replaced (the route tree, a route file
     * it kept up), once it is replaced: `destination` as the generator names
     * it, `file` the path it renamed over (the real path of a linked route
     * file). Linked directories on the way are not resolved. A bundler whose
     * compilation already took its changed files builds them again (the
     * router plugin's webpack and Rspack watch mode).
     */
    onWrite?: (written: { destination: string; file: string }) => void
  }) {
    this.config = opts.config
    this.root = opts.root
    this.logger =
      opts.logger ?? logging({ disabled: this.config.disableLogging })
    this.style = styleOf(this.config)
    this.routerPackage = routerPackageOf(this.config.target)
    this.treeFile = path.resolve(this.root, this.config.generatedRouteTree)
    this.treeKey = normalize(this.treeFile)
    this.routesDirectory = normalize(
      path.resolve(this.root, this.config.routesDirectory),
    )
    this.virtualConfigFile =
      typeof this.config.virtualRouteConfig === 'string'
        ? normalize(path.resolve(this.root, this.config.virtualRouteConfig))
        : undefined
    this.listed = listsEntryNamed(this.config)
    this.publisher = new AtomicPublisher(this.config.tmpDir)
    this.onWrite = opts.onWrite
    this.plugins = [...(this.config.plugins ?? [])]
    for (const plugin of this.plugins) {
      plugin.init?.({ generator: this })
    }
    if (process.env.TSR_COMPILER_STATS === '1') {
      registerStats(this, (g) => {
        let pendingBytes = 0
        for (const f of g.files.values()) {
          if (f.pending) {
            pendingBytes +=
              (f.pending.content.length + f.pending.over.length) * 2
          }
        }
        return {
          files: g.files.size,
          pendingBytes,
          routesByFile: g.generation.routesByFile.size,
          queue: g.queue.length,
          waiters: g.waiters.length,
        }
      })
    }
  }

  /**
   * Handles a file event (or, without one, regenerates everything) and
   * resolves once every queued event is handled; rejects when the last
   * batch failed (no root route, conflicting routes, a failed write). While
   * a `build` run waits, every batch is a build (R86): a later event never
   * hands it the route a broken file kept.
   */
  public run(event?: GeneratorEvent): Promise<void> {
    if (this.retired) {
      return Promise.resolve()
    }
    if (event && event.type !== 'rerun' && event.type !== 'build') {
      const file = normalize(event.path)
      if (this.classify(file) === null) {
        return Promise.resolve()
      }
      this.queue.push({ type: event.type, path: file })
    } else {
      this.queue.push(event ?? { type: 'rerun' })
    }
    const done = new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject, build: event?.type === 'build' })
    })
    this.drain()
    return done
  }

  /**
   * Another generator writes this one's files from now on (a host replaced
   * it, e.g. for a changed config): a run in flight or queued writes,
   * publishes to the plugins and fails nothing more, and later runs do
   * nothing.
   */
  public retire(): void {
    this.retired = true
  }

  /** The route files of the tree and their route ids (`GetRoutesByFileMapResult`: the same object until an entry changes). */
  public getRoutesByFileMap(): GetRoutesByFileMapResult {
    return this.generation.routesByFile
  }

  /**
   * The error of the last batch, when it failed (no root route, conflicting
   * routes, a failed write); undefined when it succeeded or before any.
   */
  public lastFailure(): unknown {
    return this.generation.failure?.error
  }

  /**
   * The real path of a scanned file that is a symlink (or sits under a
   * linked directory), as the generator last read or wrote it: the path
   * bundlers resolve its modules to; undefined for any other file. During a
   * run, it can be newer than the published generation (inside
   * `onRouteTreeChanged`, it is that generation's).
   */
  public realPathOf(file: string): string | undefined {
    return this.files.get(file)?.realPath
  }

  /**
   * The digest (`contentDigest`) of what the generator last read or wrote of
   * a file the published route tree imports, asked by the file's scanned
   * path or by its real path; undefined for any other file (one the tree
   * does not import, such as a `__root.lazy.tsx`, or no route file).
   */
  public sourceDigest(file: string): string | undefined {
    return this.generation.digests.get(normalize(file))
  }

  /** The digest (`contentDigest`) of the route tree the generator published last; undefined before the first. */
  public treeDigest(): string | undefined {
    return this.generation.tree?.digest
  }

  /** Whether a run has generated the route tree (and its registry) yet. */
  public hasGenerated(): boolean {
    return this.generation.model !== undefined
  }

  /** The tree model of the last generation, after the queued events. */
  public async getTreeModel(): Promise<TreeModel | undefined> {
    await this.draining
    return this.generation.model
  }

  /**
   * Prints a route tree module of `model` (e.g. a pruned copy) with this
   * generator's options, some of them overridden.
   */
  public printRouteTree(
    model: TreeModel,
    overrides: {
      disableTypes?: boolean
      header?: ReadonlyArray<string>
      footer?: ReadonlyArray<string>
    } = {},
  ): string {
    return printTree(model, {
      style: this.style,
      disableTypes: overrides.disableTypes ?? this.config.disableTypes,
      routerPackage: this.routerPackage,
      treeFile: this.treeFile,
      addExtensions: this.config.addExtensions,
      importRoutesUsingAbsolutePaths:
        this.config.importRoutesUsingAbsolutePaths,
      header: overrides.header ?? this.config.routeTreeFileHeader,
      footer: overrides.footer ?? this.footer(),
    })
  }

  /**
   * What a watcher must watch for this generator: the routes directory and
   * every `physical()` mount (for created, changed and deleted files), the
   * route tree and virtual route config files, and the route files of the
   * last scan outside those directories (a virtual route config can name
   * any file).
   */
  public watchTargets(): { directories: Array<string>; files: Array<string> } {
    const mounts = (this.scan?.physicalDirectories ?? []).filter(
      (dir) => !isUnder(dir, this.routesDirectory),
    )
    const directories = [this.routesDirectory, ...mounts]
    return {
      directories,
      files: [
        this.treeKey,
        ...(this.virtualConfigFile ? [this.virtualConfigFile] : []),
        ...[...this.scanned].filter(
          (file) => !directories.some((dir) => isUnder(file, dir)),
        ),
      ],
    }
  }

  private footer(): Array<string> {
    const footer = this.config.routeTreeFileFooter
    if (!footer) {
      return []
    }
    return Array.isArray(footer) ? footer : footer()
  }

  /**
   * What a (normalized) file is to the generator: the route tree, a virtual
   * route config, a route file of the last scan (`known`), a route file or
   * `__virtual.ts` the scan may find (`new`, `config`), or nothing of its
   * (null).
   */
  private classify(file: string): 'tree' | 'config' | 'known' | 'new' | null {
    if (file === this.treeKey) {
      return 'tree'
    }
    if (file === this.virtualConfigFile) {
      return 'config'
    }
    if (this.files.has(file) || this.scanned.has(file)) {
      return 'known'
    }
    const config = isVirtualConfigFile(path.basename(file))
    if (!config && !routeFileExtension.test(file)) {
      return null
    }
    if (!this.mayFind(file)) {
      return null
    }
    return config ? 'config' : 'new'
  }

  /**
   * Whether a scan may find a file the last one did not: one under a
   * directory a physical scan lists whose path below it the scan's ignore
   * rules keep (none under a `-components/` directory), or under the
   * directory of a module that lists routes (the routes directory of a
   * `virtualRouteConfig` file, a `__virtual.ts` the last scan evaluated:
   * it may name any file). An inline `virtualRouteConfig` object lists no
   * more than the last scan saw. With no successful scan to go by (none
   * yet, or the last batch failed: a `physical()` mount of a directory not
   * created yet, even one named like `-shared`, fails the scan until it
   * is), any file under the routes directory or a mount of the last scan.
   */
  private mayFind(file: string) {
    const lenient = !this.scan || this.generation.failure !== undefined
    const listedUnder = (dir: string) =>
      isUnder(file, dir) &&
      (lenient ||
        file
          .slice(dir.length + 1)
          .split('/')
          .every(this.listed))
    return (
      (this.config.virtualRouteConfig === undefined
        ? listedUnder(this.routesDirectory)
        : (lenient || this.virtualConfigFile !== undefined) &&
          isUnder(file, this.routesDirectory)) ||
      (this.scan?.physicalDirectories ?? []).some(listedUnder) ||
      (this.scan?.subtreeDirectories ?? []).some((dir) => isUnder(file, dir))
    )
  }

  private drain() {
    if (this.draining) {
      return
    }
    this.draining = (async () => {
      // Events reported together (a rename's delete and create) join one batch
      await Promise.resolve()
      while (this.queue.length && !this.retired) {
        const batch = this.queue.splice(0)
        try {
          await this.processBatch(
            batch,
            this.waiters.some((w) => w.build),
          )
        } catch (error) {
          // No tree: the last generation's routes and tree stay, with what
          // the files say now (a consumer answers `Route` from the registry
          // instead of reading the file, so it can't wait for a tree that
          // may not come); what this batch read reaches the tree with the
          // next one, which scans again
          const { model, tree, routes } = this.generation
          this.install({ model, tree, routes, failure: { error } })
        }
      }
      // (retired: another generator answers for these files, a failure of
      // this one's last run is no one's, and what is queued is dropped)
      const failure = this.retired ? undefined : this.generation.failure
      if (this.retired) {
        this.queue.length = 0
      }
      const waiters = this.waiters.splice(0)
      this.draining = undefined
      for (const waiter of waiters) {
        if (failure) {
          waiter.reject(failure.error)
        } else {
          waiter.resolve()
        }
      }
    })()
  }

  /**
   * Installs the generation a batch ends with: its registry and digests are
   * derived here, from what the files say once the batch's writes are done.
   * The registry stays the same object while no entry changes.
   */
  private install(
    next: Pick<Generation, 'model' | 'tree' | 'routes' | 'failure'>,
  ) {
    if (this.retired) {
      // (another generator answers for these files)
      return
    }
    const routesByFile = new Map<string, GetRoutesByFileMapResultValue>()
    const routeLinks: Array<[string, GetRoutesByFileMapResultValue]> = []
    /** Links whose upkeep is unwritten (a failed batch): such a link becomes a file of its own, so another link claims its real path first. */
    const unwritten: typeof routeLinks = []
    for (const { file, routeId, kind } of next.routes) {
      const state = this.files.get(file)
      const value = {
        routeId,
        kind,
        routerConstructor:
          state?.facts.included === true && state.facts.routerConstructor,
      }
      routesByFile.set(file, value)
      if (state?.realPath !== undefined) {
        ;(state.pending === undefined ? routeLinks : unwritten).push([
          state.realPath,
          value,
        ])
      }
    }
    routeLinks.push(...unwritten)
    const digests = new Map<string, string>()
    const digestLinks: Array<[string, string]> = []
    for (const file of next.model ? importedFiles(next.model) : []) {
      const state = this.files.get(file)
      if (state && state.digest !== '') {
        digests.set(file, state.digest)
        if (state.realPath !== undefined) {
          digestLinks.push([state.realPath, state.digest])
        }
      }
    }
    withRealPaths(routesByFile, routeLinks)
    withRealPaths(digests, digestLinks)
    const previous = this.generation.routesByFile
    this.generation = {
      ...next,
      routesByFile: sameRegistry(previous, routesByFile)
        ? previous
        : routesByFile,
      digests,
    }
  }

  private async processBatch(batch: Array<GeneratorEvent>, build: boolean) {
    let structural = !this.scan || this.generation.failure !== undefined
    const changed = new Set<string>()
    /** The files the batch's events name: read whatever their stamps say. */
    const named = new Set<string>()
    for (const event of batch) {
      if (event.type === 'rerun' || event.type === 'build') {
        structural = true
        continue
      }
      named.add(event.path)
      const kind = this.classify(event.path)
      if (kind === 'tree') {
        // Mostly our own write coming back: no change unless the file on
        // disk is no longer the one published (below)
        continue
      }
      if (event.type !== 'update' || kind !== 'known') {
        // A file added or removed, a virtual route config edited, or a file
        // the last scan did not see: the routes are scanned again.
        structural = true
      } else {
        changed.add(event.path)
      }
    }

    // The tree on disk is no longer the one published (a git operation, an
    // editor, a deleted file): the routes are scanned again before it is
    // printed. The operation may have deleted route files whose events come
    // later (chokidar reports a delete ~100 ms after the other events), so
    // the last scan's routes could import a file that is gone. The publish
    // records the file it compared, so this happens once per outside write.
    if (!structural && !(await this.treeOnDiskIsPublished())) {
      structural = true
    }

    // What the re-read files changed: the tree's routes, or only the
    // recorded options of some
    const changes = { routes: false, props: false }
    const consider = (key: string, before: FileState | undefined) => {
      const after = this.files.get(key)
      if (after?.facts.included !== before?.facts.included) {
        changes.routes = true
      } else if (
        after?.facts.included &&
        before?.facts.included &&
        !sameProps(after.facts.props, before.facts.props)
      ) {
        changes.props = true
      }
    }

    if (structural) {
      let scan: ScanResult
      try {
        scan = await scanRoutes(this.config, this.root, this.logger)
      } catch (error) {
        // (rejects: a build fails on a file it knows broken, else with this)
        await this.readFiles([Promise.reject(error)], build)
        throw error
      }
      this.scan = scan
      const nodes = filesOf(scan)
      const keys = new Set(nodes.map((node) => node.fullPath))
      this.scanned = keys
      for (const key of [...this.files.keys()]) {
        if (!keys.has(key)) {
          this.files.delete(key)
        }
      }
      await this.readFiles(
        nodes.map((node) =>
          this.updateFile(node, {
            isRoot: node === scan.rootRouteNode,
            // a build reads what it builds, whatever the stamps say
            force: build || named.has(node.fullPath),
          }),
        ),
        build,
      )
      changes.routes = true
    } else {
      const byKey = new Map(
        filesOf(this.scan!).map((node) => [node.fullPath, node]),
      )
      await this.readFiles(
        [...changed].map(async (key) => {
          const node = byKey.get(key)
          if (!node) {
            return
          }
          const before = this.files.get(key)
          await this.updateFile(node, {
            isRoot: node === this.scan!.rootRouteNode,
            force: true,
          })
          consider(key, before)
        }),
        build,
      )
    }

    const published = this.generation
    if (!changes.routes && !changes.props) {
      // The tree is as before; the registry and digests follow the files
      await this.writePending(published.model!)
      this.install({ ...published, failure: undefined })
      return
    }
    // (until installed, the model stays the published one)
    const model = this.buildModel()
    await this.writePending(model)
    this.install({
      model,
      // (the tree's routes as before, only some recorded options changed:
      // no print)
      tree: changes.routes ? await this.publishTree(model) : published.tree,
      routes: changes.routes ? this.routesOfScan() : published.routes,
      failure: undefined,
    })
    this.notifyPlugins()
  }

  /**
   * Waits for every read of a batch, so its outcome does not depend on which
   * settled first. A route file that does not parse outranks any other
   * failure, and every such file is named: read now, or, in a build, one that
   * still holds the text that kept its last good route (a build has none: it
   * fails before anything is written).
   */
  private async readFiles(reads: Array<Promise<void>>, build: boolean) {
    const failures = (await Promise.allSettled(reads)).flatMap((read) =>
      read.status === 'rejected' ? [read.reason as unknown] : [],
    )
    const unparsable = failures.flatMap((failure) =>
      failure instanceof UnparsableRouteFileError ? [failure.detail] : [],
    )
    if (build) {
      for (const [file, state] of [...this.files].sort(([a], [b]) =>
        a < b ? -1 : 1,
      )) {
        if (!state.unparsable) {
          continue
        }
        const content = await readIfExists(file).catch(() => null)
        if (content !== null && digestOf(content) === state.digest) {
          unparsable.push(
            `Cannot generate the route of ${displayFile(file, this.root)}:\n${state.unparsable}`,
          )
        }
      }
    }
    if (unparsable.length > 0) {
      throw new UnparsableRouteFileError(unparsable.join('\n'))
    }
    if (failures.length > 0) {
      throw failures[0]
    }
  }

  private buildModel(): TreeModel {
    const scan = this.scan!
    const factsOf = (node: RouteNode) => this.files.get(node.fullPath)?.facts
    const model = buildTreeModel({
      scan,
      config: this.config,
      isIncluded: (node) => factsOf(node)?.included ?? false,
      propsOf: (node) => {
        const facts = factsOf(node)
        return facts?.included ? facts.props : undefined
      },
    })
    checkRouteFullPathUniqueness(model, this.root)
    return model
  }

  private notifyPlugins() {
    if (this.retired) {
      return
    }
    for (const plugin of this.plugins) {
      plugin.onRouteTreeChanged?.({
        model: this.generation.model!,
        generator: this,
      })
    }
  }

  /**
   * Writes the upkeep of the route files the tree imports (SPEC J1.1, J1.3):
   * the tree decides which files are routes, so a scanned file it leaves out
   * (a `__root/route.tsx` beside `__root.tsx`, a lazy file of the root route,
   * an unused duplicate) is never edited. A symlinked route file keeps its
   * link, unless the file it names is another route file of the tree too, or
   * another one links to it: that file holds one route, so the link becomes
   * a file of its own (as on main, which never kept a link).
   */
  private async writePending(model: TreeModel) {
    const upkeep = [...this.files].filter(
      ([, state]) => state.pending !== undefined,
    )
    if (upkeep.length === 0) {
      return
    }
    const treeFiles = importedFiles(model)
    const routesByRealPath = new Map<string, number>()
    for (const file of treeFiles) {
      const real = this.files.get(file)?.realPath ?? file
      routesByRealPath.set(real, (routesByRealPath.get(real) ?? 0) + 1)
    }
    // (every write settles before the run does: a failed one, or a throwing
    // `onWrite` observer, fails the run with the first failure)
    const writes = await Promise.allSettled(
      upkeep.map(async ([file, state]) => {
        const pending = state.pending!
        if (!treeFiles.has(file)) {
          return
        }
        if (pending.over === '' && file === model.root.file) {
          this.logger.log(`🟡 Creating ${file}`)
        }
        const ownFile =
          state.realPath !== undefined &&
          routesByRealPath.get(state.realPath)! > 1
        if (this.retired) {
          return
        }
        let written: WrittenFile
        try {
          written = await this.publisher.write(
            file,
            pending.content,
            pending.over,
            ownFile,
          )
        } catch (error) {
          if (error instanceof ConcurrentEditError) {
            // Edited while we kept it up: handled again with its new content
            this.queue.push({ type: 'update', path: file })
            return
          }
          throw error
        }
        this.files.set(file, {
          ...state,
          digest: digestOf(pending.content),
          pending: undefined,
          // (the stamp of what it wrote)
          stamp: (await stampOf(file)) ?? undefined,
          // (a file of its own under a linked directory keeps a real path)
          realPath: ownFile ? await linkedRealPath(file) : state.realPath,
        })
        // (told once the write is recorded: an observer that throws fails
        // the run, and the generation is the one written)
        this.onWrite?.(written)
      }),
    )
    const failed = writes.find((write) => write.status === 'rejected')
    if (failed) {
      throw failed.reason
    }
  }

  /** Writes the route tree of `model` unless the file holds it; returns it as published. */
  private async publishTree(model: TreeModel): Promise<Generation['tree']> {
    const published = this.generation.tree
    const printed = this.printRouteTree(model)
    const formatting = this.config.enableRouteTreeFormatting === true
    // (an unchanged print is not formatted again)
    const content = !formatting
      ? printed
      : published?.printed === printed
        ? published.content
        : await formatWithPrettier(printed, this.style)
    // Compared with the disk, not with what was written last: a deleted or
    // edited tree is written again (unchanged since published: no read).
    const onDisk = (await this.treeOnDiskIsPublished())
      ? published!.content
      : await readIfExists(this.treeFile)
    if (this.retired) {
      return published
    }
    if (onDisk !== content) {
      // A file of its own, as on main: its imports are relative to where it
      // is configured, and a link elsewhere would resolve them from there
      const written = await this.publisher.write(
        this.treeFile,
        content,
        undefined,
        true,
      )
      this.onWrite?.(written)
    }
    const stat = await fsp.stat(this.treeFile)
    return {
      content,
      digest: digestOf(content),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      printed: formatting ? printed : undefined,
    }
  }

  private async treeOnDiskIsPublished() {
    const published = this.generation.tree
    if (!published) {
      return false
    }
    const stat = await fsp.stat(this.treeFile).catch(() => null)
    return (
      stat !== null &&
      stat.mtimeMs === published.mtimeMs &&
      stat.size === published.size
    )
  }

  /**
   * Reads a route file and, when its content changed since the last read,
   * scaffolds or keeps it up and records its facts. A file that does not
   * parse keeps the facts of its last good content (its route stays), and
   * is reported with the position of the problem; without an earlier read,
   * the run fails naming it.
   */
  private async updateFile(
    node: RouteNode,
    { isRoot, force }: { isRoot: boolean; force: boolean },
  ) {
    const key = node.fullPath
    const file = node.fullPath
    const role = roleOf(node, isRoot)
    const known = this.files.get(key)
    const previous = known?.role === role ? known : undefined
    // (stamped before the read: a change after it shows in the next stamp)
    const stamp = await stampOf(file)
    if (
      !force &&
      stamp &&
      previous?.stamp?.mtimeMs === stamp.mtimeMs &&
      previous.stamp.size === stamp.size
    ) {
      return
    }
    const content = stamp ? await readIfExists(file) : null
    if (content === null) {
      if (isRoot) {
        throw new RouteGenerationError(
          `The root route file ${displayFile(file, this.root)} does not exist: create it, with \`export const Route = createRootRoute()\`.`,
        )
      }
      // (a file a directory listing found and a delete removed since is no
      // route; a file a config names is one: never drop it silently)
      if (node._namedByConfig) {
        throw new RouteGenerationError(
          `The route file ${displayFile(file, this.root)} named by the virtual route config does not exist: create it, or fix its path in the config.`,
        )
      }
      // (no content's digest: an empty file read next is no unchanged one)
      this.files.set(key, {
        digest: '',
        facts: { included: false },
        role,
      })
      return
    }
    const realPath = await linkedRealPath(file)
    const digest = digestOf(content)
    if (previous && previous.digest === digest) {
      this.files.set(key, { ...previous, stamp: stamp!, realPath })
      return
    }
    const { pending, ...state } = this.factsOf(node, isRoot, content, known)
    this.files.set(key, {
      ...state,
      digest,
      pending:
        pending === undefined ? undefined : { content: pending, over: content },
      role,
      stamp: stamp!,
      realPath,
    })
  }

  private factsOf(
    node: RouteNode,
    isRoot: boolean,
    content: string,
    previous: FileState | undefined,
  ): ContentFacts {
    const file = node.fullPath
    const isVue = file.endsWith('.vue')
    const isPiece = pieceTypes.includes(node._fsRouteType)
    const routeId = node.routePath ?? ''

    if (isRoot) {
      const source =
        content === ''
          ? scaffoldRouteFile({
              target: this.config.target,
              kind: 'root',
              routeId: rootPathId,
              noJsx: /\.[mc]?ts$/.test(file),
              style: this.style,
            })
          : content
      if (isVue) {
        // (a single-file component is never parsed: its script is not its text)
        return {
          pending: source !== content ? source : undefined,
          facts: { included: true, props: undefined, routerConstructor: false },
        }
      }
      const analysis = analyzeRouteFile(source, file, {
        routeId: rootPathId,
        kind: 'root',
        routerPackage: this.routerPackage,
        style: this.style,
      })
      if (analysis.kind === 'error') {
        return this.unparsableFacts(file, analysis.diagnostics, previous)
      }
      const output =
        analysis.kind === 'route' ? (analysis.output ?? source) : source
      return {
        pending: output !== content ? output : undefined,
        facts: {
          included: true,
          props: undefined,
          routerConstructor: analysis.kind === 'route' && !analysis.foreign,
        },
      }
    }

    if (content === '' && (isVue || isPiece)) {
      // Empty pieces stay empty and unused (SPEC J1.3, J1.17)
      return { facts: { included: false } }
    }
    if (isVue) {
      // Single-file components are pieces the generator never edits
      return {
        facts: { included: true, props: undefined, routerConstructor: false },
      }
    }

    if (node.routePath) {
      validateRouteParams(node.routePath, node.filePath, this.logger)
    }

    const lazy = node._fsRouteType === 'lazy'
    let source = content
    if (content === '') {
      const custom = this.config.customScaffolding
      source = scaffoldRouteFile({
        target: this.config.target,
        kind: lazy ? 'lazy' : 'route',
        routeId,
        noJsx: /\.[mc]?ts$/.test(file),
        style: this.style,
        template: lazy
          ? (custom?.lazyRouteTemplate ?? custom?.routeTemplate)
          : custom?.routeTemplate,
      })
    }

    const analysis = analyzeRouteFile(source, file, {
      routeId,
      kind: lazy ? 'lazy' : 'file',
      routerPackage: this.routerPackage,
      style: this.style,
    })

    if (analysis.kind === 'error') {
      return this.unparsableFacts(file, analysis.diagnostics, previous)
    }

    if (analysis.kind === 'no-route') {
      this.warnNoRouteExport(file)
      return {
        pending: source !== content ? source : undefined,
        facts: { included: false },
      }
    }

    for (const diagnostic of analysis.diagnostics) {
      this.logger.warn(
        `[tanstack-router] ${formatDiagnostic(displayFile(file, this.root), diagnostic)}`,
      )
    }
    const output = analysis.output ?? source
    return {
      pending: output !== content ? output : undefined,
      facts: {
        included: true,
        props: analysis.props,
        routerConstructor: !analysis.foreign,
      },
    }
  }

  /**
   * A route file that does not parse. Nothing of this generator knows its
   * route (a cold run, a dev server's first generation, a file created
   * broken): the run fails naming it and leaves the route tree on disk as it
   * is, as on main (a route never silently drops out of a build). Else it
   * keeps the facts of its last good content and is reported; a build fails
   * on it (`build`).
   */
  private unparsableFacts(
    file: string,
    diagnostics: ReadonlyArray<FileDiagnostic>,
    previous: FileState | undefined,
  ): ContentFacts {
    const name = displayFile(file, this.root)
    const messages = diagnostics.map((d) => formatDiagnostic(name, d))
    if (!previous) {
      throw new UnparsableRouteFileError(
        `Cannot generate the route of ${name}:\n${messages.join('\n')}`,
      )
    }
    for (const message of messages) {
      // (the parser's message may end without a period)
      this.logger.warn(
        `[tanstack-router] ${message}${/[.!?]$/.test(message) ? '' : '.'} The route tree keeps this file's last good route until it parses.`,
      )
    }
    return {
      facts: previous.facts.included ? previous.facts : { included: false },
      unparsable: messages.join('\n'),
    }
  }

  private warnNoRouteExport(file: string) {
    const fileName = path.basename(file)
    const dirName = path.dirname(file)
    const ignorePrefix = this.config.routeFileIgnorePrefix
    const ignorePattern = this.config.routeFileIgnorePattern
    const suggestedFullPath = path.join(dirName, `${ignorePrefix}${fileName}`)

    let message = `[tanstack-router] The route file ${displayFile(file, this.root)} does not export a \`Route\`, so it is not in the route tree. If it is a route, export it as \`Route\` (\`export const Route = createFileRoute(…)(…)\`).`
    message += `\n\nIf this file is not intended to be a route, you can exclude it using one of these options:`
    message += `\n  1. Rename the file to ${displayFile(suggestedFullPath, this.root)} (prefix with "${ignorePrefix}")`
    message += `\n  2. Use 'routeFileIgnorePattern' in your config to match this file`
    message += `\n\nCurrent configuration:`
    message += `\n  routeFileIgnorePrefix: "${ignorePrefix}"`
    message += `\n  routeFileIgnorePattern: ${ignorePattern ? `"${ignorePattern}"` : 'undefined'}`
    this.logger.warn(message)
  }

  /** The registry's routes of the last scan: its route files the facts include. */
  private routesOfScan(): Array<RegistryRoute> {
    const scan = this.scan!
    return filesOf(scan).flatMap((node) =>
      this.files.get(node.fullPath)?.facts.included
        ? [
            {
              file: node.fullPath,
              routeId: node.routePath ?? `/${rootPathId}`,
              kind:
                node === scan.rootRouteNode
                  ? 'root'
                  : node._fsRouteType === 'lazy'
                    ? 'lazy'
                    : 'file',
            },
          ]
        : [],
    )
  }
}
