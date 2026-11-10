/** Helpers of the Vite hosts (router and Start). */
import { readFile } from 'node:fs/promises'
import { deriveId, identify } from '../identity'
import { positionSuffix } from '../diagnostics'
import { pathsOf } from './rebuild'
import type { DiagnosticPosition } from '../diagnostics'
import type { CompilerCaches, InvalidateChange } from '../host'
import type { PlanKey } from '../identity'

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

/** What the invalidation reads of a Vite environment's module graph. */
export interface ModuleGraphLike<TNode> {
  getModulesByFile: (file: string) => Set<TNode> | undefined
  invalidateModule: (
    mod: TNode,
    seen: Set<TNode>,
    timestamp: number,
    isHmr: boolean,
    softInvalidate: boolean,
  ) => void
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
 * read here and watched. Vite's load fallback cleans the id of its query and
 * fragment, and a `#` of a project path (`C#`, `project #2`) would end the
 * path there. A derived id with a foreign query (`.vue?vue&…`) or of a
 * virtual module is its owner's to load (null).
 */
export async function loadDerivedSource(
  ctx: { addWatchFile: (id: string) => void },
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
  ctx.addWatchFile(identity.path)
  return code
}

/**
 * Applies an `invalidate()` result to a Vite environment's module graph,
 * the host side of the one operation: the modules of the files of its
 * evicted and dependent plans in the environment are hard-invalidated (Vite
 * transforms them again on their next request) and returned. A registry
 * change invalidates the changed file's own modules too (a file that was no
 * route before has no plan to evict, and is one now). Start's hosts, whose
 * plans depend on other modules, opt in to two refinements:
 * - `ownUpdate`: the changed file's own modules are Vite's own hot update,
 *   left out of the returned dependents;
 * - `awaitingAdd`: on `unlink`, the dependents wait for a file to appear
 *   (`add`) before they are invalidated. Vite propagates the deleted
 *   module's own update to its importers at once, and a dependent
 *   transformed while the file is missing fails at `vite:import-analysis`,
 *   which marks it not self-accepting, so its later updates go through its
 *   importers (a route module, whose split component is never re-imported:
 *   the page keeps the old module). Such dependents keep their
 *   soft-invalidated output until then; a plan of theirs the core evicted at
 *   `unlink` is compiled then.
 */
export function applyViteInvalidation<TNode>(
  environment: { name: string; moduleGraph: ModuleGraphLike<TNode> },
  change: InvalidateChange,
  res: { evicted: Array<PlanKey>; dependents: Array<PlanKey> },
  timestamp: number,
  opts: { ownUpdate?: boolean; awaitingAdd?: Set<string> } = {},
): Array<TNode> {
  const files = new Set(
    pathsOf([...res.evicted, ...res.dependents], environment.name),
  )
  if (opts.ownUpdate) {
    files.delete(change.path)
  }
  const waiting = opts.awaitingAdd
  if (waiting && change.kind === 'unlink') {
    for (const file of files) {
      waiting.add(file)
    }
    return []
  }
  if (waiting && change.kind === 'add') {
    for (const file of waiting) {
      files.add(file)
    }
    waiting.clear()
  }
  if (change.kind === 'registry') {
    files.add(change.path)
  }
  const graph = environment.moduleGraph
  const seen = new Set<TNode>()
  const nodes: Array<TNode> = []
  for (const file of files) {
    for (const node of graph.getModulesByFile(file) ?? []) {
      graph.invalidateModule(node, seen, timestamp, true, false)
      nodes.push(node)
    }
  }
  return nodes
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
