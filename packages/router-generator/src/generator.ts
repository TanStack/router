import path from 'node:path'
import * as fsp from 'node:fs/promises'
import { logging } from './logger'
import { isVirtualConfigFile } from './filesystem/physical/getRouteNodes'
import { rootPathId } from './filesystem/physical/rootPathId'
import { scanRoutes } from './filesystem/scan'
import { replaceBackslash } from './utils'
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
import type { Logger } from './logger'

export type FileEventType = 'create' | 'update' | 'delete'
export type FileEvent = {
  type: FileEventType
  path: string
}
export type GeneratorEvent = FileEvent | { type: 'rerun' }

/**
 * What a route file contributes to the tree, from its last analysis that
 * parsed (a file saved mid-edit keeps the facts of its last parse until it
 * parses again).
 */
type FileFacts =
  | { included: false }
  | { included: true; props: RouteProps | undefined }

/** A file's modification time and size, to tell it unchanged without reading it. */
interface FileStamp {
  readonly mtimeMs: number
  readonly size: number
}

interface FileState {
  /** The content last read (or written by the generator). */
  readonly content: string
  readonly stamp?: FileStamp
  /**
   * What the file's upkeep writes (a scaffold, an id or constructor fix):
   * written only while the route tree imports the file. A file the tree
   * leaves out is never edited.
   */
  readonly pending?: string
  /** The facts of the file as its upkeep leaves it. */
  readonly facts: FileFacts
  /**
   * The route the file was kept up for (`roleOf`): a file is analysed again
   * when the scan gives it another route, its content unchanged (SPEC J1.1).
   */
  readonly role: string
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

const pieceTypes: ReadonlyArray<FsRouteType> = [
  'loader',
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
]

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
 * and none is lost (SPEC J1.10). Each batch rebuilds the tree model from
 * the scan and the facts of each route file, which are kept by path and
 * replaced whenever the file's content changes; the model itself is never
 * reused (no route node outlives a generation).
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
  private readonly publisher: AtomicPublisher

  private scan: ScanResult | undefined
  private readonly files = new Map<string, FileState>()
  private model: TreeModel | undefined
  /** The route tree as last published, to tell an external change of it. */
  private published:
    | { content: string; mtimeMs: number; size: number }
    | undefined
  /** A batch failed after the scan changed: the next one rebuilds the tree. */
  private stale = false
  private routesByFile: GetRoutesByFileMapResult = new Map()
  /** The real paths of the scan roots, for those that differ. */
  private realRoots: Array<[scanned: string, real: string]> = []

  private queue: Array<GeneratorEvent> = []
  private waiters: Array<{
    resolve: () => void
    reject: (error: unknown) => void
  }> = []
  private draining: Promise<void> | undefined

  constructor(opts: { config: Config; root: string }) {
    this.config = opts.config
    this.root = opts.root
    this.logger = logging({ disabled: this.config.disableLogging })
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
    this.publisher = new AtomicPublisher(this.config.tmpDir)
    this.plugins = [...(this.config.plugins ?? [])]
    for (const plugin of this.plugins) {
      plugin.init?.({ generator: this })
    }
    if (process.env.TSR_COMPILER_STATS === '1') {
      registerStats(this, (g) => {
        let contentBytes = 0
        for (const f of g.files.values()) {
          contentBytes += f.content.length * 2
        }
        return {
          files: g.files.size,
          contentBytes,
          routesByFile: g.routesByFile.size,
          queue: g.queue.length,
          waiters: g.waiters.length,
        }
      })
    }
  }

  /**
   * Handles a file event (or, without one, regenerates everything) and
   * resolves once every queued event is handled; rejects when the last
   * batch failed (no root route, conflicting routes, a failed write).
   */
  public run(event?: GeneratorEvent): Promise<void> {
    if (event && event.type !== 'rerun') {
      const file = normalize(event.path)
      if (this.classify(file) === null) {
        return Promise.resolve()
      }
      this.queue.push({ type: event.type, path: file })
    } else {
      this.queue.push({ type: 'rerun' })
    }
    const done = new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject })
    })
    this.drain()
    return done
  }

  /** The route files of the tree and their route ids (`GetRoutesByFileMapResult`: a new snapshot per publishing batch; the plugin context dedupes an unchanged one). */
  public getRoutesByFileMap(): GetRoutesByFileMapResult {
    return this.routesByFile
  }

  /** The tree model of the last generation, after the queued events. */
  public async getTreeModel(): Promise<TreeModel | undefined> {
    await this.draining
    return this.model
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
   * every `physical()` mount (for created, changed and deleted files), and
   * the route tree and virtual route config files.
   */
  public watchTargets(): { directories: Array<string>; files: Array<string> } {
    return {
      directories: [
        this.routesDirectory,
        ...(this.scan?.physicalDirectories ?? []).filter(
          (dir) => !isUnder(dir, this.routesDirectory),
        ),
      ],
      files: [
        this.treeKey,
        ...(this.virtualConfigFile ? [this.virtualConfigFile] : []),
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
   * route config, a route file of the last scan (`known`), a route file the
   * scan may find (`new`), or nothing of its (null).
   */
  private classify(file: string): 'tree' | 'config' | 'known' | 'new' | null {
    if (file === this.treeKey) {
      return 'tree'
    }
    if (
      file === this.virtualConfigFile ||
      isVirtualConfigFile(path.basename(file))
    ) {
      return 'config'
    }
    if (this.files.has(file)) {
      return 'known'
    }
    if (!routeFileExtension.test(file)) {
      return null
    }
    return isUnder(file, this.routesDirectory) ||
      (this.scan?.physicalDirectories ?? []).some((dir) => isUnder(file, dir))
      ? 'new'
      : null
  }

  private drain() {
    if (this.draining) {
      return
    }
    this.draining = (async () => {
      // Events reported together (a rename's delete and create) join one batch
      await Promise.resolve()
      let failure: { error: unknown } | undefined
      while (this.queue.length) {
        const batch = this.queue.splice(0)
        try {
          await this.processBatch(batch)
          failure = undefined
        } catch (error) {
          failure = { error }
        }
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

  private async processBatch(batch: Array<GeneratorEvent>) {
    let structural = !this.scan || this.stale
    const changed = new Set<string>()
    /** The files the batch's events name: read whatever their stamps say. */
    const named = new Set<string>()
    for (const event of batch) {
      if (event.type === 'rerun') {
        structural = true
        continue
      }
      named.add(event.path)
      const kind = this.classify(event.path)
      if (kind === 'tree') {
        // Mostly our own write coming back: the tree is printed again only
        // when the file on disk is no longer the one published (below)
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
      this.stale = true
      const scan = await scanRoutes(this.config, this.root)
      this.scan = scan
      const nodes = filesOf(scan)
      const keys = new Set(nodes.map((node) => node.fullPath))
      for (const key of [...this.files.keys()]) {
        if (!keys.has(key)) {
          this.files.delete(key)
        }
      }
      await Promise.all(
        nodes.map((node) =>
          this.updateFile(node, {
            isRoot: node === scan.rootRouteNode,
            force: named.has(node.fullPath),
          }),
        ),
      )
      changes.routes = true
      this.realRoots = await this.realRootsOf(scan)
    } else {
      const byKey = new Map(
        filesOf(this.scan!).map((node) => [node.fullPath, node]),
      )
      await Promise.all(
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
      )
    }

    // The tree's routes are as before (no tree rebuild, no print), unless
    // the tree on disk is no longer the one published.
    if (!changes.routes && (await this.treeOnDiskIsPublished())) {
      if (changes.props) {
        this.rebuildModel()
        this.notifyPlugins()
      }
      await this.writePending()
      return
    }

    // (until published: a failure here rebuilds on the next batch)
    this.stale = true
    this.rebuildModel()
    await this.writePending()
    await this.publishTree()
    this.routesByFile = this.computeRoutesByFile()
    this.stale = false
    this.notifyPlugins()
  }

  private rebuildModel() {
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
    checkRouteFullPathUniqueness(model)
    this.model = model
  }

  private notifyPlugins() {
    for (const plugin of this.plugins) {
      plugin.onRouteTreeChanged?.({ model: this.model!, generator: this })
    }
  }

  /**
   * Writes the upkeep of the route files the tree imports (SPEC J1.1, J1.3):
   * the tree decides which files are routes, so a scanned file it leaves out
   * (a `__root/route.tsx` beside `__root.tsx`, a lazy file of the root route,
   * an unused duplicate) is never edited.
   */
  private async writePending() {
    const treeFiles = importedFiles(this.model!)
    await Promise.all(
      [...this.files].map(async ([file, state]) => {
        if (state.pending === undefined || !treeFiles.has(file)) {
          return
        }
        if (state.content === '' && file === this.model!.root.file) {
          this.logger.log(`🟡 Creating ${file}`)
        }
        try {
          await this.publisher.write(file, state.pending, state.content)
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
          content: state.pending,
          pending: undefined,
          // (the stamp of what it wrote)
          stamp: (await stampOf(file)) ?? undefined,
        })
      }),
    )
  }

  private async publishTree() {
    let content = this.printRouteTree(this.model!)
    if (this.config.enableRouteTreeFormatting === true) {
      content = await formatWithPrettier(content, this.style)
    }
    // Compared with the disk, not with what was written last: a deleted or
    // edited tree is written again (unchanged since published: no read).
    const onDisk = (await this.treeOnDiskIsPublished())
      ? this.published!.content
      : await readIfExists(this.treeFile)
    if (onDisk !== content) {
      await this.publisher.write(this.treeFile, content)
    }
    const stat = await fsp.stat(this.treeFile)
    this.published = { content, mtimeMs: stat.mtimeMs, size: stat.size }
  }

  private async treeOnDiskIsPublished() {
    if (!this.published) {
      return false
    }
    const stat = await fsp.stat(this.treeFile).catch(() => null)
    return (
      stat !== null &&
      stat.mtimeMs === this.published.mtimeMs &&
      stat.size === this.published.size
    )
  }

  /**
   * Reads a route file and, when its content changed since the last read,
   * scaffolds or keeps it up and records its facts. A file that does not
   * parse keeps the facts of its last good content (its route stays), and
   * is reported with the position of the problem.
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
        throw new Error(`⚠️ expected root route to exist at ${file}`)
      }
      this.files.set(key, { content: '', facts: { included: false }, role })
      return
    }
    if (previous && previous.content === content) {
      this.files.set(key, { ...previous, stamp: stamp! })
      return
    }
    const state = this.factsOf(node, isRoot, content, known)
    this.files.set(key, { ...state, role, stamp: stamp! })
  }

  private factsOf(
    node: RouteNode,
    isRoot: boolean,
    content: string,
    previous: FileState | undefined,
  ): Omit<FileState, 'role'> {
    const file = node.fullPath
    const isVue = file.endsWith('.vue')
    const isPiece = pieceTypes.includes(node._fsRouteType)
    const routeId = node.routePath ?? ''

    if (isRoot) {
      if (content !== '') {
        return { content, facts: { included: true, props: undefined } }
      }
      const scaffold = scaffoldRouteFile({
        target: this.config.target,
        kind: 'root',
        routeId: rootPathId,
        noJsx: /\.[mc]?ts$/.test(file),
        style: this.style,
      })
      return {
        content,
        pending: scaffold,
        facts: { included: true, props: undefined },
      }
    }

    if (content === '' && (isVue || isPiece)) {
      // Empty pieces stay empty and unused (SPEC J1.3, J1.17)
      return { content, facts: { included: false } }
    }
    if (isVue) {
      // Single-file components are pieces the generator never edits
      return { content, facts: { included: true, props: undefined } }
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
      lazy,
      routerPackage: this.routerPackage,
      style: this.style,
    })

    if (analysis.kind === 'error') {
      for (const diagnostic of analysis.diagnostics) {
        console.warn(formatDiagnostic(file, diagnostic))
      }
      return {
        content,
        facts: previous?.facts.included ? previous.facts : { included: false },
      }
    }

    if (analysis.kind === 'no-route') {
      this.warnNoRouteExport(file)
      return {
        content,
        pending: source !== content ? source : undefined,
        facts: { included: false },
      }
    }

    for (const diagnostic of analysis.diagnostics) {
      console.warn(formatDiagnostic(file, diagnostic))
    }
    const output = analysis.output ?? source
    return {
      content,
      pending: output !== content ? output : undefined,
      facts: { included: true, props: analysis.props },
    }
  }

  private warnNoRouteExport(file: string) {
    const fileName = path.basename(file)
    const dirName = path.dirname(file)
    const ignorePrefix = this.config.routeFileIgnorePrefix
    const ignorePattern = this.config.routeFileIgnorePattern
    const suggestedFullPath = path.join(dirName, `${ignorePrefix}${fileName}`)

    let message = `Warning: Route file "${file}" does not export a Route. This file will not be included in the route tree.`
    message += `\n\nIf this file is not intended to be a route, you can exclude it using one of these options:`
    message += `\n  1. Rename the file to "${suggestedFullPath}" (prefix with "${ignorePrefix}")`
    message += `\n  2. Use 'routeFileIgnorePattern' in your config to match this file`
    message += `\n\nCurrent configuration:`
    message += `\n  routeFileIgnorePrefix: "${ignorePrefix}"`
    message += `\n  routeFileIgnorePattern: ${ignorePattern ? `"${ignorePattern}"` : 'undefined'}`
    console.warn(message)
  }

  private async realRootsOf(scan: ScanResult) {
    const roots = [this.routesDirectory, ...scan.physicalDirectories]
    const real = await Promise.all(
      roots.map(async (dir): Promise<[string, string] | undefined> => {
        const resolved = await fsp.realpath(dir).catch(() => dir)
        const normalized = replaceBackslash(resolved)
        return normalized === dir ? undefined : [dir, normalized]
      }),
    )
    return real.filter((entry) => entry !== undefined)
  }

  private computeRoutesByFile(): GetRoutesByFileMapResult {
    const map = new Map<string, GetRoutesByFileMapResultValue>()
    const scan = this.scan!
    for (const node of filesOf(scan)) {
      const key = node.fullPath
      if (!this.files.get(key)?.facts.included) {
        continue
      }
      const value = { routeId: node.routePath ?? `/${rootPathId}` }
      map.set(key, value)
      for (const [scanned, real] of this.realRoots) {
        if (isUnder(key, scanned)) {
          map.set(real + key.slice(scanned.length), value)
        }
      }
    }
    return map
  }
}
