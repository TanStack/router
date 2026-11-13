/**
 * What the compiler's Vite plugins (`compiler-plugin.ts`, `late-pass-plugin.ts`,
 * `server-fn-plugins.ts`) of one `startCompilerPlugin` share: its options and
 * what derives from them, and the session of each build run or dev server
 * with the state of its environments' hooks.
 */
import { createHash } from 'node:crypto'
import {
  promises as fs,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  SCRIPT_ASSET_QUERY_RE,
  ViteRunSessions,
  displayPath,
  identify,
  isVirtualId,
  normalizePath,
  registerCompilerStats,
  viteLog,
} from '@tanstack/router-utils/compiler'
import { RouteRegistryView } from '@tanstack/router-plugin/planners'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '@tanstack/router-plugin/context'
import { DEV_CLIENT_ENTRY, VITE_ENVIRONMENT_NAMES } from '../constants'
import { StartCompilerSession } from '../compiler/session'
import { dependencyTextFilter } from '../compiler/scope'
import { resolveImportProtectionConfig } from '../import-protection/config'
import { escapeRegExp, resolveViteId } from '../utils'
import { invalidateRegistry, reloadMismatched } from './invalidation'
import { createVirtualWaits } from './virtual-waits'
import type { StartCompilerEnvironment } from '../compiler/session'
import type {
  CompileOutcome,
  CompiledOutputLike,
} from '../import-protection/session'
import type { GenerateFunctionId } from '../server-fns/ids'
import type {
  CompileStartFrameworkOptions,
  GetConfigFn,
  NormalizedClientBuild,
  StartRscOptions,
} from '../types'
import type { RouterPluginContext } from '@tanstack/router-plugin/context'
import type {
  CompileOutput,
  Diagnostic,
  DiagnosticPosition,
  HostServices,
  InputSourceMap,
} from '@tanstack/router-utils/compiler'
import type {
  DevEnvironment,
  Environment,
  OptimizedDepInfo,
  ResolvedConfig,
  Rolldown,
  ViteDevServer,
} from 'vite'

/** A Start environment of the Vite host: a resolver environment may forward to another one's `getServerFnById`. */
export interface ViteStartEnvironment extends StartCompilerEnvironment {
  getServerFnById?: string
}

export interface StartCompilerPluginOptions {
  framework: CompileStartFrameworkOptions
  environments: Array<ViteStartEnvironment>
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
 * The id Vite serves a dependency's source entry as: the optimizer's bundle
 * of a pre-bundled dependency (`unoptimizedDependency` reversed: other
 * importers get that bundle), else the entry itself.
 */
export function optimizedDependency(
  environment: Environment,
  src: string,
): string {
  const optimizer = (environment as DevEnvironment).depsOptimizer
  if (!optimizer) {
    return src
  }
  const { optimized, discovered } = optimizer.metadata as {
    optimized: Record<string, OptimizedDepInfo>
    discovered?: Record<string, OptimizedDepInfo>
  }
  for (const table of [optimized, discovered ?? {}]) {
    for (const info of Object.values(table)) {
      if (info.src === src) {
        return optimizer.getOptimizedDepId(info)
      }
    }
  }
  return src
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

/**
 * `build --watch`: makes the file a server build's modules that embed the
 * client build watch (`ViteCompilerState.embedClientBuild`), rewritten when a
 * client build moves what they embedded, holding `digest`: in a directory of
 * the run's own in the system's temporary directory (`mkdtemp`: only the
 * user can open it, under a name nobody can predict, so nothing can be
 * planted in it), removed when the run's watchers close. Outside the app, so
 * that no `build.watch.exclude` of the app's directories hides it from the
 * server's watcher (Rolldown applies the filter to the files a `load` adds);
 * a `build.watch.include` takes it in (`watchesSentinel`). Null: the
 * temporary directory is unusable (warned): no client build rebuilds the
 * server. A save only the client bundles leaves the server's build as it is,
 * and so does one both bundle when the server's build embeds before the
 * client's build of it began (`clientBuilding` is not set yet).
 */
function makeSentinel(digest: string, environment: Environment): string | null {
  try {
    // (the real path: the watcher reports it so, e.g. macOS's
    // `/private/var`, Windows' long names)
    const dir = mkdtempSync(
      path.join(realpathSync.native(tmpdir()), 'tanstack-start-'),
    )
    const sentinel = normalizePath(path.join(dir, 'client-build'))
    writeFileSync(sentinel, digest)
    return sentinel
  } catch (error) {
    environment.logger.warn(
      `[tanstack-start] the server build will not follow the client's builds: making a directory in ${tmpdir()} failed (${String(error)}). After a save, the server's documents may keep naming the client's older files: always for a file only the client bundles, and for a file both bundle when the client's build of it starts after the server's. Make sure ${tmpdir()} exists and is writable, or set TMPDIR to a writable directory, and restart the watch build.`,
    )
    return null
  }
}

/** The sentinel's path, whatever the run (`makeSentinel`). */
const SENTINEL_RE = /[\\/]tanstack-start-[^\\/]+[\\/]client-build$/

/**
 * The build options a server environment of `build --watch` adds to the
 * app's: an app's `build.watch.include` also takes in the sentinel (an
 * empty one watches everything already).
 */
export function watchesSentinel(
  watch:
    | {
        include?: unknown
      }
    | null
    | undefined,
): { build: { watch: { include: Array<RegExp> } } } | null {
  const include = watch?.include
  if (
    include === undefined ||
    include === null ||
    (Array.isArray(include) && include.length === 0)
  ) {
    return null
  }
  return { build: { watch: { include: [SENTINEL_RE] } } }
}

/** What the server embeds of a client build, as a digest (the manifest's maps by their entries). */
function clientBuildDigest(
  manifest: ClientManifest,
  functionIds: ReadonlyArray<string>,
): string {
  const { clientBuild, cssCodeSplitDisabledFileName } = manifest
  return createHash('sha1')
    .update(
      JSON.stringify([
        clientBuild.entryChunkFileName,
        [...clientBuild.chunksByFileName],
        [...(clientBuild.cssContentByFileName ?? [])],
        cssCodeSplitDisabledFileName ?? null,
        functionIds,
      ]),
    )
    .digest('base64url')
}

/** What the start manifest reads of the client's build (its capture, `start-manifest-plugin`). */
export interface ClientManifest {
  clientBuild: NormalizedClientBuild
  /** The `style.css` the client emits when `build.cssCodeSplit` is off. */
  cssCodeSplitDisabledFileName: string | undefined
}

/**
 * A client build of a build run, as the server environment embeds it: the
 * start manifest (the client's files) and the server functions the client
 * references (the server's resolver answers only those, J4.2).
 */
export interface ClientBuildRecord {
  /** A digest of what the server embeds of the build. */
  digest: string
  manifest: ClientManifest
  functionIds: ReadonlySet<string>
}

/** The client build as the server's modules embed it (`ViteCompilerState.embedClientBuild`). */
export interface ClientBuilds {
  /** The client's build of the environment's run ended with its bundle (the start manifest's capture). */
  publishClientBuild: (
    environment: Environment,
    manifest: ClientManifest,
  ) => void
  /** A module of a server environment's build embeds the run's client build (null: none built in this run). */
  embedClientBuild: (ctx: EmbeddingContext) => Promise<ClientBuildRecord | null>
}

/** The hook context of a server module that embeds the client build. */
export interface EmbeddingContext {
  environment: Environment
  meta: { watchMode: boolean }
  addWatchFile: (id: string) => void
}

/**
 * What one run of the plugins shares across the Start environments: a build
 * run (one `buildApp` of a builder: every environment it builds, the
 * rebuilds of `build --watch` included) or a dev server (a restart creates
 * another one). What a run compiled and learned dies with it: a second build
 * or server of the same plugin objects starts from nothing, as one of new
 * plugin objects does (a config file gives new ones each time).
 */
export interface Session {
  start: StartCompilerSession
  bundledDev: boolean
  /** The app's entry module ids (dev traces start there). */
  entries: Set<string>
  /** The dev server of the session (null in a build). */
  server: ViteDevServer | null
  /**
   * Per-env loaders of genuinely virtual ids (the dev plugin container, or
   * `this.load` in a build): an id is loaded by the environment that
   * resolved it, never asked of another one (in `vite build --watch` the
   * environments build at once, and an id a build cannot load fails it).
   */
  readonly virtualLoaders: Map<string, (id: string) => Promise<string | null>>
  /** A build's waits of compiles of virtual modules on virtual texts (`virtual-waits.ts`). */
  readonly virtualWaits: ReturnType<typeof createVirtualWaits>
  /**
   * The client environment's last build in this run that ended with its
   * bundle (null: none yet): what the server's resolver and start manifest
   * embed.
   */
  clientBuild: ClientBuildRecord | null
  /**
   * `build --watch`: the digests of the client builds each server
   * environment's current build embedded (emptied when its build starts).
   * The environments build at once, in any order: a client build whose
   * digest differs from one embedded writes the sentinel, a file those
   * modules watch, and the server environment's own watcher rebuilds it.
   */
  readonly embedded: Map<string, Set<string>>
  /**
   * `build --watch`: the sentinel's path (`makeSentinel`), from a server
   * module's first embed until the run's watchers close (`watching`); null:
   * none (the temporary directory was unusable, or the watchers closed).
   */
  sentinel: string | null | undefined
  /** `build --watch`: the environments whose watchers have not closed yet. */
  readonly watching: Set<string>
  /**
   * `build --watch`: the client's build running now (its watcher's
   * `BUNDLE_START` to its `BUNDLE_END` or `ERROR`, when Start's `buildApp`
   * follows the watcher), which a server module waits for before it embeds
   * the client build: an edit both environments bundle then builds the
   * server once. An optimisation only: the sentinel rebuilds a server that
   * embedded another client build.
   */
  clientBuilding: { ended: Promise<void>; end: () => void } | null
  /**
   * `build --watch`: each environment's resolver (its plugin context's, from
   * its last build), for the invalidations of a file event: a plan's
   * resolutions are asked again with its own environment's resolver.
   */
  readonly resolvers: Map<
    string,
    (
      source: string,
      importer?: string,
      options?: { skipSelf?: boolean },
    ) => Promise<{ id: string; external?: boolean | string } | null>
  >
  /** Dev: the server functions the dev lookup warned about (once each). */
  readonly devWarned: Set<string>
  /** Dev: stops what the session listens to (`closeServer`). */
  readonly disposers: Array<() => void>
}

/**
 * The shared state of the compiler's Vite plugins (one per
 * `startCompilerPlugin`): the options, what derives from them and from the
 * resolved config (the transform filters), and the session of each
 * environment's run (`sessionOf`).
 */
export class ViteCompilerState implements ClientBuilds {
  readonly ssrIsProvider: boolean
  readonly envNames: Set<string>
  readonly resolverEnvironments: Set<string>
  /**
   * The transform filter of dependency scripts. Its text test is set from
   * the resolved config (it depends on import protection's configuration);
   * without one, every dependency script reaches the compiler, whose scope
   * decides.
   */
  readonly dependencyFilter: {
    id: { include: Array<RegExp>; exclude: Array<RegExp> }
    code?: RegExp
  } = {
    id: { include: [DEPENDENCY_SCRIPT_RE], exclude: [SCRIPT_ASSET_QUERY_RE] },
  }
  /** What the main transform leaves to `dependencyFilter` (the optimizer's bundles are added from the resolved config). */
  readonly ownExclude: Array<RegExp> = [SCRIPT_ASSET_QUERY_RE, DEPENDENCY_ID_RE]
  /** The environment whose plugin runs `watchChange` (bundled dev): one invalidation per change, applied to every environment. */
  readonly watchingEnv: string | undefined
  /** The session of each environment's run (a builder's or a dev server's environments are its own objects). */
  private readonly runs = new ViteRunSessions<
    Session,
    ResolvedConfig,
    ViteDevServer
  >(
    (config, server) => this.createSession(config, server),
    '[tanstack-start] the compiler plugin',
  )

  constructor(readonly opts: StartCompilerPluginOptions) {
    this.ssrIsProvider = opts.providerEnvName === VITE_ENVIRONMENT_NAMES.server
    this.envNames = new Set(opts.environments.map((e) => e.name))
    this.resolverEnvironments = new Set(
      this.ssrIsProvider
        ? [opts.providerEnvName]
        : [VITE_ENVIRONMENT_NAMES.server, opts.providerEnvName],
    )
    this.watchingEnv = opts.environments[0]?.name
  }

  /**
   * The transform filters of a resolved config (`configResolved`; a build
   * resolves one per environment, all alike). Before any hook reads them:
   * Vite reads a dev server's lazily, Rolldown a build's when it starts.
   */
  configure(config: ResolvedConfig): void {
    // the optimizer's bundles are dependencies wherever the app keeps
    // them: a custom `cacheDir` is outside every `node_modules`
    this.dependencyFilter.id.include.splice(
      1,
      Infinity,
      cacheDirRe(config.cacheDir, true),
    )
    this.ownExclude.splice(2, Infinity, cacheDirRe(config.cacheDir))
    const { startConfig, resolvedStartConfig } = this.opts.getConfig()
    const text = dependencyTextFilter(
      resolveImportProtectionConfig(startConfig.importProtection, {
        root: config.root,
        srcDirectory: resolvedStartConfig.srcDirectory,
        mode: config.command === 'build' ? 'build' : 'dev',
      }),
    )
    if (text) {
      this.dependencyFilter.code = text
    } else {
      delete this.dependencyFilter.code
    }
  }

  /** The session of a builder's run (Start's `buildApp`) or of a dev server (`configureServer`). */
  sessionOfRun(
    environments: Record<string, Environment>,
    config: ResolvedConfig,
    server: ViteDevServer | null,
  ): Session {
    return this.runs.ofRun(environments, config, server)
  }

  /** The session of an environment's run (`ViteRunSessions.of`). */
  sessionOf(environment: Environment): Session {
    return this.runs.of(environment)
  }

  /** Dev: the server of `environment` closed (Vite closes each environment's plugins): its session stops listening. */
  closeServer(environment: Environment): void {
    const s = this.runs.peek(environment)
    for (const dispose of s?.disposers.splice(0) ?? []) {
      dispose()
    }
  }

  /**
   * `build --watch`: an environment's watcher closed. Once every watcher of
   * the run closed, the sentinel's directory goes.
   */
  closeWatcher(environment: Environment): void {
    const s = this.runs.peek(environment)
    if (!s) {
      return
    }
    s.watching.delete(environment.name)
    if (s.watching.size === 0 && s.sentinel) {
      rmSync(path.dirname(s.sentinel), { recursive: true, force: true })
      s.sentinel = null
    }
  }

  envOf(name: string): ViteStartEnvironment | undefined {
    return this.opts.environments.find((e) => e.name === name)
  }

  private createSession(
    config: ResolvedConfig,
    server: ViteDevServer | null,
  ): Session {
    const cached = cacheDirRe(config.cacheDir)
    const { startConfig, resolvedStartConfig } = this.opts.getConfig()
    const virtualLoaders: Session['virtualLoaders'] = new Map()
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
          const load = virtualLoaders.get(env)
          return load ? load(id).catch(() => null) : null
        },
        // pre-bundled dependencies, in the app's `cacheDir` (a Start library
        // declaring the framework as a peer is never pre-bundled): what the
        // optimizer metadata maps back to a source entry is read there
        // (`unoptimizedDependency`)
        opaque: (p) => cached.test(normalizePath(p)),
        label: 'start:vite',
      }),
      bundledDev: !!config.experimental.bundledDev,
      entries: new Set(),
      server,
      virtualLoaders,
      virtualWaits: createVirtualWaits(),
      clientBuild: null,
      embedded: new Map(),
      sentinel: undefined,
      watching: new Set(),
      clientBuilding: null,
      resolvers: new Map(),
      devWarned: new Set(),
      disposers: [],
    }
    registerCompilerStats('start:vite:entries', s.entries, readEntries)
    if (server) {
      // a registry change (the generator published new route ids) re-plans
      // the route modules concerned: the server's own listener
      s.disposers.push(
        onRoutesChanged(this.opts.routerPluginContext, (next, previous) => {
          for (const file of changedRoutePaths(next, previous)) {
            void invalidateRegistry(this, s, file).catch((error: unknown) => {
              server.config.logger.error(
                `[tanstack-start] invalidating ${file} after a route change failed: ${String(error)}`,
              )
            })
          }
        }),
      )
    }
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
        host.awaitVirtual = s.virtualWaits.of(environment.name, subject)
      }
    }
    return host
  }

  /**
   * The client's build of the environment's run ended with its bundle (the
   * start manifest's capture, `generateBundle`): the record the server
   * embeds, with the server functions the build references (its compiles
   * are done). `build --watch`: a server build that embedded another client
   * build is built again by its own watcher, whichever of the two watchers
   * runs first (the sentinel it watches is written).
   */
  publishClientBuild(environment: Environment, manifest: ClientManifest): void {
    const s = this.sessionOf(environment)
    const functionIds = s.start.registry
      .entries()
      .filter((e) => e.clientReferenced)
      .map((e) => e.id)
      .sort()
    const digest = clientBuildDigest(manifest, functionIds)
    s.clientBuild = { digest, manifest, functionIds: new Set(functionIds) }
    this.followClientBuild(s, environment)
  }

  /**
   * `build --watch`: a server build that embedded another client build than
   * the last one is built again (the sentinel is written). At a client
   * build's bundle, and at the end of each server build: Rolldown watches a
   * build's files once it ended, so a write while a server's first build
   * ran went unseen.
   */
  private followClientBuild(s: Session, environment: Environment): void {
    const digest = s.clientBuild?.digest ?? ''
    if (
      s.sentinel &&
      [...s.embedded.values()].some((digests) =>
        [...digests].some((embedded) => embedded !== digest),
      )
    ) {
      writeSentinel(s.sentinel, digest, environment)
    }
  }

  /**
   * `build --watch`: follows an environment's watcher (Start's `buildApp`):
   * the client's build running now (`Session.clientBuilding`); the end of
   * a server environment's build (`followClientBuild`).
   */
  followWatcher(
    environment: Environment,
    watcher: Rolldown.RolldownWatcher,
  ): void {
    const s = this.sessionOf(environment)
    const client = this.envOf(environment.name)?.type === 'client'
    watcher.on('event', (event) => {
      if (!client) {
        if (event.code === 'END') {
          this.followClientBuild(s, environment)
        }
      } else if (event.code === 'BUNDLE_START' && !s.clientBuilding) {
        let end!: () => void
        const ended = new Promise<void>((resolve) => (end = resolve))
        s.clientBuilding = { ended, end }
      } else if (event.code === 'BUNDLE_END' || event.code === 'ERROR') {
        s.clientBuilding?.end()
        s.clientBuilding = null
      }
    })
  }

  /**
   * A module of a server environment's build embeds the run's client build
   * (null: none built in this run). `build --watch`: once the client's
   * running build ended (`Session.clientBuilding`); the module watches the
   * sentinel, and the digest is noted as the server build's (none built yet,
   * e.g. a client whose first build failed, is a digest of its own: the
   * client's first build rebuilds the server).
   */
  async embedClientBuild(
    ctx: EmbeddingContext,
  ): Promise<ClientBuildRecord | null> {
    const s = this.sessionOf(ctx.environment)
    if (ctx.meta.watchMode) {
      await s.clientBuilding?.ended
    }
    const record = s.clientBuild
    if (ctx.meta.watchMode) {
      const digest = record?.digest ?? ''
      if (s.sentinel === undefined) {
        s.sentinel = makeSentinel(digest, ctx.environment)
      }
      if (s.sentinel) {
        ctx.addWatchFile(s.sentinel)
      }
      let digests = s.embedded.get(ctx.environment.name)
      if (!digests) {
        digests = new Set()
        s.embedded.set(ctx.environment.name, digests)
      }
      digests.add(digest)
    }
    return record
  }

  /** Whether `env` is a server-fn provider of its own (RSC), not the SSR environment. */
  isSeparateProvider(env: ViteStartEnvironment): boolean {
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
   * reach now are printed, and (dev) a denied file its importers now ask
   * for otherwise is built again (`reloadMismatched`), before the module is
   * served (a host completion event, no microtask polling). Gives the mock
   * to serve instead of the output, if any.
   */
  afterCompile(
    s: Session,
    env: ViteStartEnvironment,
    id: string,
    out: CompiledOutputLike,
    fail: (error: Error) => never,
  ): CompileOutcome['mock'] | Promise<CompileOutcome['mock']> {
    const finish = ({ error, mock }: CompileOutcome) => {
      if (error) {
        fail(error)
      }
      const ipEnv = s.start.ip?.env(env.name, env.type)
      ipEnv?.reporter?.flush()
      return s.server && ipEnv?.serving
        ? reloadMismatched(s, env).then(() => mock)
        : mock
    }
    const outcome = s.start.afterCompile(env, id, out)
    return outcome instanceof Promise ? outcome.then(finish) : finish(outcome)
  }
}

/**
 * Writes the sentinel. A failed write (its directory gone) leaves the
 * server's build as it is: it is the environment's logger's to print, not
 * the client build's to fail. The directory is never made again: under a
 * name others can see, it would no longer be the run's own.
 */
function writeSentinel(
  sentinel: string,
  digest: string,
  environment: Environment,
): void {
  try {
    writeFileSync(sentinel, digest)
  } catch (error) {
    environment.logger.warn(
      `[tanstack-start] the server build no longer follows the client's builds: writing ${sentinel} failed (${String(error)}). The server's documents may keep naming the client's older files; restart the watch build.`,
    )
  }
}
