/**
 * What the compiler's Vite plugins (`compiler-plugin.ts`, `late-pass-plugin.ts`,
 * `server-fn-plugins.ts`) of one `startCompilerPlugin` share: its options, the
 * session of the dev server or build (created at `configResolved`) and the
 * state of the environments' hooks.
 */
import { promises as fs, readFileSync } from 'node:fs'
import {
  ASSET_QUERY_RE,
  collectionSizes,
  displayPath,
  identify,
  isVirtualId,
  normalizePath,
  registerCompilerStats,
  viteLog,
} from '@tanstack/router-utils/compiler'
import { RouteRegistryView } from '@tanstack/router-plugin/planners'
import { DEV_CLIENT_ENTRY, VITE_ENVIRONMENT_NAMES } from '../constants'
import { StartCompilerSession } from '../compiler/session'
import { escapeRegExp, resolveViteId } from '../utils'
import { createVirtualWaits } from './virtual-waits'
import type {
  CompileOutcome,
  CompiledOutputLike,
} from '../import-protection/session'
import type { GenerateFunctionId } from '../server-fns/ids'
import type {
  CompileStartFrameworkOptions,
  GetConfigFn,
  StartRscOptions,
} from '../types'
import type { RouterPluginContext } from '@tanstack/router-plugin/context'
import type {
  CompileOutput,
  Diagnostic,
  DiagnosticPosition,
  HostServices,
  InputSourceMap,
  invalidate,
} from '@tanstack/router-utils/compiler'
import type { DevEnvironment, Environment, ViteDevServer } from 'vite'

export interface StartCompilerEnvironment {
  name: string
  type: 'client' | 'server'
  getServerFnById?: string
}

export interface StartCompilerPluginOptions {
  framework: CompileStartFrameworkOptions
  environments: Array<StartCompilerEnvironment>
  generateFunctionId?: GenerateFunctionId
  /** The Vite environment name of the server function provider. */
  providerEnvName: string
  rsc?: StartRscOptions | undefined
  getConfig: GetConfigFn
  /** The generator's registry (route modules by file), shared with the generator plugin. */
  routerPluginContext: RouterPluginContext
  /** The app's resolved entries (import protection's trace roots). */
  resolveEntries: () => {
    entryPaths: {
      client: string
      server: string
      start: string
      router: string
    }
  }
}

/** A dependency module: `node_modules` in its path (not its query). */
const DEPENDENCY_ID_RE = /^[^?]*[\\/]node_modules[\\/]/

/** A dependency's script module (the `TRANSFORM_ID_REGEX` of `DEPENDENCY_ID_RE`). */
const DEPENDENCY_SCRIPT_RE =
  /^[^?]*[\\/]node_modules[\\/].*\.[cm]?[tj]sx?(?:$|\?)/

/**
 * The optimizer's bundles of an app: files of Vite's resolved `cacheDir`
 * (`node_modules/.vite` by default, or wherever the app keeps it), the
 * dependencies of `DEPENDENCY_ID_RE` wherever they are written. `script`:
 * its script modules only (`DEPENDENCY_SCRIPT_RE`).
 */
export function cacheDirRe(cacheDir: string, script = false): RegExp {
  const dir = escapeRegExp(normalizePath(cacheDir).replace(/\/$/, ''))
  return new RegExp(
    script ? `^${dir}/[^?]*\\.[cm]?[tj]sx?(?:$|\\?)` : `^${dir}/`,
  )
}

const readAwaitingAdd = (awaitingAdd: Map<string, Set<string>>) =>
  collectionSizes({ awaitingAdd })

const readEntries = (entries: Set<string>) => ({ size: entries.size })

/**
 * The source entry of a pre-bundled dependency, when `id` is the dependency
 * optimizer's bundle (`<cacheDir>/deps/x.js?v=…`, the optimizer's own
 * test: the app may keep its `cacheDir` anywhere): the optimizer
 * resolves a dependency to its bundle before the bundle is written, so facts
 * read through that path would see a missing module; the package's own entry
 * is what the dependency is (deterministic, and stable across re-optimization).
 */
function unoptimizedDependency(environment: Environment, id: string): string {
  const optimizer = (environment as DevEnvironment).depsOptimizer
  if (!optimizer?.isOptimizedDepFile(id)) {
    return id
  }
  const file = id.split('?')[0]!
  const { optimized, discovered } = optimizer.metadata as {
    optimized: Record<string, { file: string; src?: string }>
    discovered?: Record<string, { file: string; src?: string }>
  }
  for (const table of [optimized, discovered ?? {}]) {
    for (const info of Object.values(table)) {
      if (info.file === file && info.src) {
        return info.src
      }
    }
  }
  return id
}

/**
 * The map of a transform's input, or null when the input is the original
 * source: its positions are the source's own. Vite answers an empty
 * sourcemap chain with an identity map it builds over the whole input
 * (and such a map counts lines by LF only, unlike ECMAScript), so the
 * file as written is compared first.
 */
export function inputMapOf(
  ctx: { getCombinedSourcemap: () => unknown },
  code: string,
  file: string,
): InputSourceMap | null {
  try {
    if (readFileSync(file, 'utf8') === code) {
      return null
    }
  } catch {
    // a virtual module: Vite's map
  }
  const map = ctx.getCombinedSourcemap() as InputSourceMap & {
    sourcesContent?: Array<string | null>
  }
  if (map.sourcesContent?.length === 1 && map.sourcesContent[0] === code) {
    return null
  }
  return map
}

/** What one dev server or build shares across the Start environments (created at `configResolved`). */
export interface Session {
  start: StartCompilerSession
  bundledDev: boolean
  /** The app's entry module ids (dev traces start there). */
  entries: Set<string>
}

/** The shared state of the compiler's Vite plugins (one per `startCompilerPlugin`). */
export class ViteCompilerState {
  readonly ssrIsProvider: boolean
  readonly envNames: Set<string>
  readonly resolverEnvironments: Set<string>
  /**
   * Per-env loaders of genuinely virtual ids (the dev plugin container, or
   * `this.load` in a build): an id is loaded by the environment that
   * resolved it, never asked of another one (in `vite build --watch` the
   * environments build at once, and an id a build cannot load fails it).
   */
  readonly virtualLoaders = new Map<
    string,
    (id: string) => Promise<string | null>
  >()
  session: Session | null = null
  server: ViteDevServer | null = null
  unsubscribeRoutes: (() => void) | null = null
  /**
   * One compiler invalidation per file event, applied by every env's
   * `hotUpdate`: Vite hands each environment's hook its own context over the
   * event's one `read` function, so the memo lives as long as the event.
   */
  readonly invalidations = new WeakMap<
    () => unknown,
    Promise<Awaited<ReturnType<typeof invalidate>>>
  >()
  /**
   * The client environment's build in this process: null until one ended.
   * The server's resolver of a build lists (or gates on) the functions the
   * client build references, which it reads from the client's compiles.
   * `build --watch`: the files of the client's module graph (else none),
   * which the server's resolver watches (an edit only the client bundles
   * rebuilds the server too), and it waits for the client build a file event
   * started (`clientRebuild`, until its `buildEnd`): the environments rebuild
   * at once.
   */
  clientFiles: Array<string> | null = null
  clientRebuild: { ended: Promise<void>; end: () => void } | null = null

  /**
   * Per env: files whose plans an `unlink` evicted or made stale, to
   * re-transform when a file appears (see `applyInvalidation`).
   */
  readonly awaitingAdd = new Map<string, Set<string>>()
  /** A build's waits of compiles of virtual modules on virtual texts (`virtual-waits.ts`). */
  readonly virtualWaits: ReturnType<typeof createVirtualWaits>
  /** Digest of the compiler's last output per environment and module id (the transform hook records it). Bounded by the modules compiled. */
  readonly outputDigests = new Map<string, Map<string, string>>()
  /**
   * The transform filter of dependency scripts. Its text test is set with
   * the session (it depends on import protection's configuration); without
   * one, every dependency script reaches the compiler, whose scope decides.
   */
  readonly dependencyFilter: {
    id: { include: Array<RegExp>; exclude: Array<RegExp> }
    code?: RegExp
  } = { id: { include: [DEPENDENCY_SCRIPT_RE], exclude: [ASSET_QUERY_RE] } }
  /** What the main transform leaves to `dependencyFilter` (the optimizer's bundles are added with the session). */
  readonly ownExclude: Array<RegExp> = [ASSET_QUERY_RE, DEPENDENCY_ID_RE]
  /** The environment whose plugin runs `watchChange` (bundled dev): one invalidation per change, applied to every environment. */
  readonly watchingEnv: string | undefined

  constructor(readonly opts: StartCompilerPluginOptions) {
    this.ssrIsProvider = opts.providerEnvName === VITE_ENVIRONMENT_NAMES.server
    this.envNames = new Set(opts.environments.map((e) => e.name))
    this.resolverEnvironments = new Set(
      this.ssrIsProvider
        ? [opts.providerEnvName]
        : [VITE_ENVIRONMENT_NAMES.server, opts.providerEnvName],
    )
    registerCompilerStats(
      'start:vite:awaitingAdd',
      this.awaitingAdd,
      readAwaitingAdd,
    )
    this.virtualWaits = createVirtualWaits()
    this.watchingEnv = opts.environments[0]?.name
  }

  requireSession(): Session {
    if (!this.session) {
      throw new Error(
        '[tanstack-start] the compiler plugin is used before `configResolved`',
      )
    }
    return this.session
  }

  envOf(name: string): StartCompilerEnvironment | undefined {
    return this.opts.environments.find((e) => e.name === name)
  }

  createSession(config: {
    root: string
    command: 'serve' | 'build'
    bundledDev: boolean
    cacheDir: string
  }): Session {
    const cached = cacheDirRe(config.cacheDir)
    const { startConfig, resolvedStartConfig } = this.opts.getConfig()
    const s: Session = {
      start: new StartCompilerSession({
        framework: this.opts.framework,
        mode: config.command === 'build' ? 'build' : 'dev',
        root: config.root,
        srcDirectory: resolvedStartConfig.srcDirectory,
        environments: this.opts.environments,
        providerEnv: this.opts.providerEnvName,
        rsc: this.opts.rsc,
        generateFunctionId: this.opts.generateFunctionId,
        codeSplittingOptions: startConfig.router.codeSplittingOptions,
        hmrStyle: 'vite',
        importProtection: startConfig.importProtection,
        isEntry: (p) => this.entriesOf(s).has(normalizePath(p)),
        routes: new RouteRegistryView(this.opts.routerPluginContext),
        readFile: (file) => fs.readFile(file, 'utf8').catch(() => null),
        loadVirtual: async (id, env) => {
          const load = this.virtualLoaders.get(env)
          return load ? load(id).catch(() => null) : null
        },
        // pre-bundled dependencies, in the app's `cacheDir` (a Start library
        // declaring the framework as a peer is never pre-bundled): what the
        // optimizer metadata maps back to a source entry is read there
        // (`unoptimizedDependency`)
        opaque: (p) => cached.test(normalizePath(p)),
        label: 'start:vite',
      }),
      bundledDev: config.bundledDev,
      entries: new Set(),
    }
    registerCompilerStats('start:vite:entries', s.entries, readEntries)
    return s
  }

  /** The app's entry ids: traces of dev reports start at them (lazily: the entries are resolved after `config`). */
  entriesOf(s: Session): Set<string> {
    if (s.entries.size === 0) {
      const { resolvedStartConfig } = this.opts.getConfig()
      const { entryPaths } = this.opts.resolveEntries()
      for (const p of [
        resolvedStartConfig.routerFilePath,
        resolvedStartConfig.startFilePath,
        entryPaths.client,
        entryPaths.server,
        entryPaths.router,
        entryPaths.start,
      ]) {
        if (p) {
          s.entries.add(normalizePath(p))
        }
      }
      s.entries.add(resolveViteId(DEV_CLIENT_ENTRY))
      s.entries.add(DEV_CLIENT_ENTRY)
    }
    return s.entries
  }

  /**
   * Host services bound to one hook context (`compiling`: the id a transform
   * compiles; a build's compile of a virtual module fails a wait on a
   * virtual text that would never end).
   */
  hostFor(
    s: Session,
    environment: Environment,
    resolve: (
      source: string,
      importer?: string,
      options?: { skipSelf?: boolean },
    ) => Promise<{ id: string; external?: boolean | string } | null>,
    compiling?: string,
  ): HostServices {
    const host = s.start.host(async (specifier, importer) => {
      // a resolver that throws (a package with no export for this
      // environment's conditions, e.g. only `node`) couldn't resolve the
      // specifier, as Rspack's resolver answers: the bundler decides on the
      // import, failing if it keeps it
      const r = await resolve(specifier, importer, { skipSelf: true }).catch(
        () => null,
      )
      if (!r) {
        return null
      }
      return {
        id: unoptimizedDependency(environment, r.id),
        external: r.external === true || typeof r.external === 'string',
      }
    })
    if (compiling !== undefined && environment.mode === 'build') {
      const subject = identify(compiling).canonicalId
      if (isVirtualId(subject)) {
        host.awaitVirtual = this.virtualWaits.of(environment.name, subject)
      }
    }
    return host
  }

  /** Whether `env` is a server-fn provider of its own (RSC), not the SSR environment. */
  isSeparateProvider(env: StartCompilerEnvironment): boolean {
    return !this.ssrIsProvider && env.name === this.opts.providerEnvName
  }

  /**
   * Reports a compile's diagnostics through a hook context (`ctx.error`
   * throws). `inputMap`: a compile of another plugin's output (its
   * positions are the original file's, `StartCompilerSession.report`). The
   * dev server's hook context maps a `loc` through the module's combined
   * source map itself: there, `loc` is the position in `code`.
   */
  reportDiagnostics(
    s: Session,
    ctx: {
      warn: (w: {
        message: string
        loc?: { file: string; line: number; column: number }
      }) => void
      error: (e: {
        message: string
        id?: string
        loc?: { file: string; line: number; column: number }
      }) => never
    },
    out: CompileOutput,
    filePath: string,
    code: string,
    envType: 'client' | 'server',
    inputMap?: () => InputSourceMap | null,
  ): void {
    // a Vue SFC's refusals are positioned in the SFC (`at`), not in `code`
    const frameOf = inputMap ? null : code
    const name = displayPath(filePath, s.start.opts.root)
    // Vite's dev transform context maps `loc` through the module's source
    // map; bundled dev's (Rolldown's) does not
    const dev = s.start.opts.mode === 'dev' && !s.bundledDev
    const log = (
      d: Diagnostic,
      at: DiagnosticPosition | undefined,
      generated?: DiagnosticPosition,
    ) =>
      dev && generated
        ? // Vite maps the position in `code` back to the SFC itself
          viteLog(d.message, generated, code, name, filePath, true)
        : viteLog(d.message, at, frameOf, name, filePath, dev)
    s.start.report(
      out,
      filePath,
      code,
      envType,
      {
        error: (d, at, generated) => ctx.error(log(d, at, generated)),
        warn: (d, at, generated) => ctx.warn(log(d, at, generated)),
      },
      inputMap,
    )
  }

  /**
   * What follows a compile (`StartCompilerSession.afterCompile`): an
   * `error`-behaviour violation fails the module; otherwise the import
   * protection reports whose importers the graph (or the judged edges) can
   * reach now are printed, before the module is served (a host completion
   * event, no microtask polling). Gives the mock to serve instead of the
   * output, if any.
   */
  afterCompile(
    s: Session,
    env: StartCompilerEnvironment,
    id: string,
    out: CompiledOutputLike,
    fail: (error: Error) => never,
  ): CompileOutcome['mock'] | Promise<CompileOutcome['mock']> {
    const finish = ({ error, mock }: CompileOutcome) => {
      if (error) {
        fail(error)
      }
      s.start.ip?.env(env.name, env.type).reporter?.flush()
      return mock
    }
    const outcome = s.start.afterCompile(env, id, out)
    return outcome instanceof Promise ? outcome.then(finish) : finish(outcome)
  }
}
