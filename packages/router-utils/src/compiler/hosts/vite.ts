/** Helpers of the Vite hosts (router and Start). */
import { readFile } from 'node:fs/promises'
import { deriveId, identify } from '../identity'
import { positionSuffix } from '../diagnostics'
import type { DiagnosticPosition } from '../diagnostics'
import type { CompilerCaches } from '../host'

/** A message as a Vite plugin log (`this.warn`, `this.error`). */
export interface ViteLog {
  message: string
  id: string
  frame?: string
  loc?: { file: string; line: number; column: number }
}

/**
 * A compile diagnostic as a Vite plugin log, router and Start alike, with
 * one position. In dev, `loc`: Vite maps it through the source maps of the
 * plugins that ran before (to the file as written), frames it and links it
 * in the overlay, printing the column as Rollup's contract has it
 * (0-based, `File: …:3:6`), like every Vite plugin's. A Vite build drops
 * `loc` from warnings and prints the header of an error as given: there the
 * message carries the position, 1-based (`positionSuffix`), with a code frame
 * of `code`. `file` is the module as messages name it (`displayPath`), `id`
 * the module's id, `code` the text the position is in (null when the
 * position was mapped elsewhere, a Vue SFC's: then the message carries it,
 * without a frame, in dev too).
 */
export function viteLog(
  message: string,
  at: DiagnosticPosition | undefined,
  code: string | null,
  file: string,
  id: string,
  dev: boolean,
): ViteLog {
  if (at === undefined) {
    return { message, id }
  }
  if (dev && code !== null) {
    return { message, id, loc: { file: id, line: at.line, column: at.column } }
  }
  const log: ViteLog = { message: `${message}${positionSuffix(file, at)}`, id }
  if (code !== null) {
    log.frame = codeFrame(code, at)
  }
  return log
}

const LINE_TERMINATOR = /\r\n|[\n\r\u2028\u2029]/

/** Two lines either side of the position and a caret under its column, in Vite's own frame layout. */
function codeFrame(code: string, at: DiagnosticPosition): string {
  const lines = code.split(LINE_TERMINATOR)
  const index = at.line - 1
  const first = Math.max(0, index - 2)
  const last = Math.min(lines.length - 1, index + 2)
  // the gutter fits the largest line number, with a space before the bar
  const width = Math.max(String(last + 1).length + 1, 3)
  const out: Array<string> = []
  for (let i = first; i <= last; i++) {
    const n = String(i + 1)
    out.push(`${n.padEnd(width)}|  ${lines[i]}`)
    if (i === index) {
      out.push(`${' '.repeat(width)}|  ${' '.repeat(at.column)}^`)
    }
  }
  return out.join('\n')
}

type SourcemapPathTransform = (source: string, sourcemapPath: string) => string

/**
 * The output options of a Rollup or Rolldown build with a
 * `sourcemapPathTransform` that names a derived output's source by its file
 * (DECISIONS D3): those bundlers name a map's sources by module id
 * (`route.tsx?tsr-split=component`), so every output of one file would be
 * another file to devtools and error trackers. Only the compiler's own query
 * keys go (`identify`); a foreign query stays, and the transform the options
 * already have runs after, once (each plugin's hook composes onto the last).
 * The webpack family names sources by resource path already.
 */
export function withOwnSourcesNamedByFile<
  T extends { sourcemapPathTransform?: SourcemapPathTransform },
>(options: T): T {
  const next = options.sourcemapPathTransform
  return {
    ...options,
    sourcemapPathTransform: (source: string, sourcemapPath: string) => {
      const file = identify(source).canonicalId
      return next ? next(file, sourcemapPath) : file
    },
  }
}

/**
 * Whether a Vite environment build (its `build` config) is the last one of
 * the logical build, after which `releaseEnvironment` is due: a written
 * bundle outside watch mode. A `write: false` build may be a scan that
 * builds the environment again (an RSC client scan), and a watch build
 * rebuilds it: their plans stay.
 */
export function isFinalBuild(
  build: { write?: boolean; watch?: unknown } | undefined,
): boolean {
  return build !== undefined && build.write !== false && !build.watch
}

/** What the stale-set take reads of a Vite dev environment's module graph. */
export interface ModuleGraphLike<TNode> {
  getModulesByFile: (file: string) => Set<TNode> | undefined
  invalidateModule: (mod: TNode) => void
}

/**
 * Takes a Vite dev environment's stale set (`CompilerCaches.stale`; `held`:
 * also the paths stale only because a file they read was removed, on a
 * creation) and invalidates the modules of its files, with the documented
 * one-argument form: a non-HMR invalidation, after which Vite drops a
 * transform of the module still in flight (a request started before the
 * event) instead of keeping its result. Returns the modules, for the hook to
 * hand to Vite with its hot update. Nothing between the take and the
 * invalidation can fail: a path taken is never lost.
 */
export function takeStaleModules<TNode>(
  caches: CompilerCaches,
  environment: { name: string; moduleGraph: ModuleGraphLike<TNode> },
  held: boolean,
): Array<TNode> {
  const graph = environment.moduleGraph
  const nodes: Array<TNode> = []
  for (const file of caches.stale.take(environment.name, { held })) {
    for (const node of graph.getModulesByFile(file) ?? []) {
      graph.invalidateModule(node)
      nodes.push(node)
    }
  }
  return nodes
}

/** What the stale-set helpers read of a Vite dev environment. */
interface StaleEnvironment<TNode> {
  name: string
  moduleGraph: ModuleGraphLike<TNode>
}

/**
 * Design 3's `hotUpdate` of a Vite host (router and Start): the event
 * forwarded (`forward`, the host's invalidation: every hook forwards, the
 * core compares), the event's own modules that the file's current plan
 * still produces (`liveModules`), and the environment's stale set, its
 * modules invalidated and handed to Vite with them (a creation takes the
 * held paths too). The event's file leaves the set first: its modules are
 * this event's, judged here (in the set, from a failed hit since the last
 * take, a compile overtaken or a registry change racing the save, it would
 * bring back the derived modules `liveModules` dropped). A path that enters
 * the set after the take waits for the next event's hook. `undefined`:
 * Vite's own update.
 */
export async function staleHotUpdate<
  T extends {
    id: string | null
    url: string
    importers: ReadonlySet<unknown>
  },
>(
  environment: StaleEnvironment<T> & {
    transformRequest: (url: string) => Promise<unknown>
  },
  caches: CompilerCaches,
  change: { path: string; kind: 'change' | 'add' | 'unlink' },
  modules: Array<T>,
  forward: () => Promise<void>,
): Promise<Array<T> | undefined> {
  await forward()
  const live =
    (await liveModules(environment, caches, change.path, modules)) ?? modules
  caches.stale.drop(environment.name, [change.path])
  const stale = takeStaleModules(
    caches,
    environment,
    change.kind === 'add',
  ).filter((node) => !live.includes(node))
  return stale.length > 0 || live !== modules ? [...live, ...stale] : undefined
}

/**
 * Outside a hot update (a registry change, a dev server without HMR): the
 * environment's stale set taken, each module invalidated and its update
 * sent (`reloadModule`; nothing is sent without HMR). A failure to send one
 * is the dev server's to print (`tag`: the plugin, as messages name it);
 * the others are still sent.
 */
export function reloadStaleModules<TNode extends { file: string | null }>(
  caches: CompilerCaches,
  environment: StaleEnvironment<TNode> & {
    reloadModule: (node: TNode) => Promise<void>
    logger: { error: (message: string) => void }
  },
  held: boolean,
  tag: string,
): void {
  for (const node of takeStaleModules(caches, environment, held)) {
    environment.reloadModule(node).catch((error: unknown) => {
      environment.logger.error(
        `${tag} sending the update of ${node.file ?? 'a module'} failed: ${String(error)}`,
      )
    })
  }
}

/**
 * `vite build --watch`: an environment's build ended (`buildEnd`). A watch
 * build builds what its watcher reported (and a module whose plan read a
 * reported file: `watchDependencies`), never one module on request, so its
 * stale set is an audit: taken whole (the held paths too), and a path that
 * was stale when the build began (`build.stale`), which the build bundles
 * (`moduleIds`) and did not compile (`build.compiled`), is a stale hit
 * (`staleHits`: a dependency the watcher was not told of).
 */
export function auditStaleSet(
  caches: CompilerCaches,
  env: string,
  build: { stale: ReadonlySet<string>; compiled: ReadonlySet<string> },
  moduleIds: Iterable<string>,
): void {
  const taken = caches.stale.take(env, { held: true })
  const owed = taken.filter(
    (path) => build.stale.has(path) && !build.compiled.has(path),
  )
  if (owed.length === 0) {
    return
  }
  const bundled = new Set<string>()
  for (const id of moduleIds) {
    bundled.add(identify(id).path)
  }
  const counters = caches.plans.get(env)?.counters
  if (counters) {
    counters.staleHits += owed.filter((path) => bundled.has(path)).length
  }
}

/**
 * `vite build --watch`: declares the files a module's plan read to the
 * watcher, so an edit of one outside the module graph (a denied file its
 * mock replaced, a marker file) rebuilds the module, as the webpack-family
 * loader's `addDependency` does. A dev server watches the project itself
 * and invalidates through `watchChange`.
 */
export function watchDependencies(
  ctx: {
    addWatchFile: (id: string) => void
    meta: { watchMode: boolean }
    environment: { mode: string }
  },
  dependencies: Iterable<string>,
  file: string,
): void {
  if (ctx.environment.mode !== 'build' || !ctx.meta.watchMode) {
    return
  }
  for (const dep of dependencies) {
    if (dep !== file) {
      ctx.addWatchFile(dep)
    }
  }
}

/** What a run's sessions read of a Vite environment. */
interface RunEnvironment<TConfig> {
  name: string
  mode: string
  getTopLevelConfig: () => TConfig
}

/**
 * The sessions of a Vite plugin's runs: one per builder run (the plugin's
 * `buildApp`, order pre, before any other plugin builds an environment) or
 * per dev server (`configureServer`), shared by its environments. Each
 * builder and dev server has environment objects of its own, so plugin
 * objects a config reuses (inline plugins of a second build, of a restarted
 * dev server) keep the state of each run apart. A build outside any
 * `buildApp` (`vite.build()`, `builder.build(env)` by hand) has no run of
 * its own: its environments join the last such run, until one of a name it
 * holds builds again (another builder's, or a second `vite.build()`).
 */
export class ViteRunSessions<TSession, TConfig, TServer> {
  private readonly sessions = new WeakMap<object, TSession>()
  /** The run that environments built outside `buildApp` join, with their names. */
  private loose: { session: TSession; names: Set<string> } | null = null

  constructor(
    private readonly create: (
      config: TConfig,
      server: TServer | null,
    ) => TSession,
    /** The plugin, as an error names it (`[tanstack-start] the compiler plugin`). */
    private readonly label: string,
  ) {}

  /**
   * The session of a builder's run or of a dev server, for all of its
   * environments. An environment that built before (an app plugin's own
   * `buildApp` listed first) began the run.
   */
  ofRun(
    environments: Record<string, object>,
    config: TConfig,
    server: TServer | null,
  ): TSession {
    const all = Object.values(environments)
    let s = all.map((e) => this.sessions.get(e)).find((known) => !!known)
    if (!s) {
      s = this.create(config, server)
    }
    for (const e of all) {
      this.sessions.set(e, s)
    }
    return s
  }

  /** The session of an environment's run (a dev server's is known from `configureServer`). */
  of(environment: RunEnvironment<TConfig>): TSession {
    const known = this.sessions.get(environment)
    if (known) {
      return known
    }
    if (environment.mode !== 'build') {
      throw new Error(
        `${this.label} of the "${environment.name}" environment was not configured for this dev server`,
      )
    }
    if (!this.loose || this.loose.names.has(environment.name)) {
      this.loose = {
        session: this.create(environment.getTopLevelConfig(), null),
        names: new Set(),
      }
    }
    this.loose.names.add(environment.name)
    this.sessions.set(environment, this.loose.session)
    return this.loose.session
  }

  /** The session of an environment, if its run has one. */
  peek(environment: object): TSession | undefined {
    return this.sessions.get(environment)
  }
}

/**
 * The `load` of a derived id of a file of the project (`route.tsx?tsr-split=…`,
 * Start's `?tss-hydrate=…`, `?tss-serverfn-split`): the file's own text,
 * read here. Vite's load fallback cleans the id of its query and fragment,
 * and a `#` of a project path (`C#`, `project #2`) would end the path there.
 * A derived id with a foreign query (`.vue?vue&…`) or of a virtual module is
 * its owner's to load (null). Rolldown is told to watch the file where it
 * builds the environment (a watch build, Vite's bundled dev); an unbundled
 * dev server is not: its watcher covers the project, the derived module's
 * `file` is the file (each event finds it), and Vite records a file a `load`
 * watches as an import of the module, which would put every derived module
 * in an import cycle with its file's module (Vite's client reloads the page
 * when an update within a cycle fails to import).
 */
export async function loadDerivedSource(
  ctx: {
    addWatchFile: (id: string) => void
    meta: { watchMode: boolean }
    environment: { mode: string; config: { isBundled?: boolean } }
  },
  id: string,
): Promise<string | null> {
  const identity = identify(id)
  if (
    identity.derived === null ||
    identity.foreignQuery !== '' ||
    identity.path.startsWith('\0')
  ) {
    return null
  }
  const code = await readFile(identity.path, 'utf8').catch(() => null)
  if (code === null) {
    return null
  }
  if (
    ctx.environment.mode === 'build'
      ? ctx.meta.watchMode
      : ctx.environment.config.isBundled === true
  ) {
    ctx.addWatchFile(identity.path)
  }
  return code
}

/**
 * The modules of a file's hot update that the file's current plan still
 * produces: the file's own modules, and its derived modules
 * (`?tsr-split=…`) whose output the plan declares. A derived module of a
 * layout the file no longer has (an extracted export once the export went,
 * a split chunk once the file stopped splitting) stays in Vite's module
 * graph, imported by the chunk or route module until those re-import: nothing
 * on the page holds its next evaluation, and an update of it either
 * dead-ends into a full reload or, as a React Refresh boundary, invalidates
 * itself ("export removed") against the route update. The file's own module
 * is transformed first, so its plan is current (Vite invalidated it before
 * the hooks ran); without a plan (the file does not parse, or is not the
 * compiler's), a derived module without importers is stale.
 * `undefined` when every module is live.
 */
export async function liveModules<
  T extends {
    id: string | null
    url: string
    importers: ReadonlySet<unknown>
  },
>(
  environment: {
    name: string
    transformRequest: (url: string) => Promise<unknown>
  },
  caches: CompilerCaches,
  file: string,
  modules: Array<T>,
): Promise<Array<T> | undefined> {
  const identities = modules.map((m) => (m.id === null ? null : identify(m.id)))
  if (!identities.some((i) => i !== null && i.derived !== null)) {
    return undefined
  }
  for (const [i, identity] of identities.entries()) {
    if (identity !== null && identity.derived === null) {
      await environment.transformRequest(modules[i]!.url).catch(() => null)
    }
  }
  let produced: Set<string> | null = null
  for (const cache of caches.plans.values()) {
    if (cache.env !== environment.name) {
      continue
    }
    for (const key of cache.keysAt(file)) {
      const entry = cache.get(key)
      if (entry) {
        produced ??= new Set()
        for (const output of Object.keys(entry.plan.outputs)) {
          produced.add(output)
        }
      }
    }
  }
  const live = modules.filter((m, i) => {
    const identity = identities[i] ?? null
    if (identity === null || identity.derived === null) {
      return true
    }
    if (produced !== null) {
      return produced.has(
        `derived:${deriveId(identity.canonicalId, identity.derived)}`,
      )
    }
    return m.importers.size > 0
  })
  return live.length === modules.length ? undefined : live
}
