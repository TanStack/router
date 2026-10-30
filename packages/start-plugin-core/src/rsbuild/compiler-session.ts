/**
 * Start's Rspack host of the compiler core on Rsbuild (see the core's
 * README.md, "Hosts"): the loader implementation compiling every id (env and
 * derived) of a module of an environment and layer through the shared Start
 * session (`compiler/session.ts`), from one `pre` loader per environment
 * (`compiler-loader.ts`); the server-fn facts and the plan's dependencies
 * persisted in the modules' `buildInfo`; and the one invalidation operation
 * of a compilation's file events, whose stale dependents the environment
 * compilers are told to build again (a module depends on no file but its
 * own). The Rspack hooks live in `host-plugin.ts`; this module is bundler-API
 * free except for the loader context shape.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  collectionSizes,
  composeLoaderMap,
  identify,
  invalidate,
  normalizePath,
  pathsOf,
  planDependencyFiles,
  planKeyString,
  registerCompilerStats,
  restorePlans,
  webpackResourceId,
} from '@tanstack/router-utils/compiler'
import { StartCompilerSession, serverFnFactsOf } from '../compiler/session'
import { providerModuleId } from '../server-fns/registry'
import {
  CLIENT_REFERENCED_IDS_PLACEHOLDER,
  manifestResolverModule,
} from '../server-fns/resolver'
import { rspackEdgeModuleIds } from '../import-protection/edge-modules'
import { RSPACK_BUILD_INFO_KEY } from '../import-protection/verdict'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { StartCompilerSessionOptions } from '../compiler/session'
import type { CompiledOutputLike } from '../import-protection/session'
import type { ImportRewrite } from '../planners/edges'
import type { ServerFnFact } from '../server-fns/registry'
import type {
  CompileOutput,
  DiagnosticPosition,
  HostServices,
  InputSourceMap,
  InvalidateChange,
  PersistedPlan,
  PlanKey,
  RecordMapText,
} from '@tanstack/router-utils/compiler'

/** The `buildInfo` field holding a module's server-fn facts (persisted by Rspack's cache; replayed at `finishMake`). */
export const SERVER_FN_BUILD_INFO_FIELD = 'tanstack.start.serverFns'

/** The `buildInfo` field holding the key and dependencies of a module's plan, as JSON (persisted by Rspack's cache; checked at a compiler's first `finishMake`). */
export const PLAN_BUILD_INFO_FIELD = 'tanstack.start.plan'

export interface ServerFnBuildInfo {
  version: 2
  canonicalId: string
  facts: Array<ServerFnFact>
}

/** Rsbuild `source.transformImport` entries (the array form) the host predicts, so the file and
 * marker rules judge the rewritten import's target. */
export interface TransformImportRule {
  libraryName: string
  libraryDirectory?: string
  customName?: string | ((member: string) => string | undefined)
  camelToDashComponentName?: boolean
  ignoreEsComponent?: Array<string>
}

/** The Start session's options an Rsbuild plugin gives (the rest is the Rsbuild host's). */
type StartRsbuildSessionOptions = Omit<
  StartCompilerSessionOptions,
  | 'providerEnv'
  | 'hmrStyle'
  | 'edgeModuleIds'
  | 'readFile'
  | 'loadVirtual'
  | 'label'
>

/** What the loader implementation uses of Rspack's loader context. */
interface LoaderContextLike {
  resource: string
  resourcePath: string
  sourceMap?: boolean
  addDependency: (file: string) => void
  emitWarning: (error: Error) => void
  _module?: { buildInfo?: Record<string, unknown>; layer?: string | null }
}

interface LoaderResult {
  code: string
  map: unknown
}

export interface LoaderOptions {
  environment: string
  /** `late`: the J6-only pass over the JS output of a non-JS module
   * (`.vue`, `.mdx`: Tier 0 only, with a host-supplied language). */
  pass?: 'late' | 'edge' | 'asset'
}

interface EnvState {
  name: string
  type: 'client' | 'server'
  transformImport: Array<TransformImportRule>
  /** The resources the loader compiled in the current compilation (host: cleared at `thisCompilation`). */
  compiled: Set<string>
  /** Where the file's text goes when the module map names it without it (host: `emittedMapTexts`). */
  recordMapText: RecordMapText | null
  /**
   * Whether the compiler's cache outlives the process (Rspack's persistent or
   * filesystem cache): only then do modules carry their plan (another process
   * restores them; Rspack copies a module's custom `buildInfo` into the
   * module at every build while any cache is on).
   */
  persistsModules: boolean
}

/** The session every compiler of one Rsbuild plugin shares. */
export class StartRsbuildCompilerSession {
  /** The bundler-free Start session (caches, import protection, registry, warnings, compiles). */
  readonly start: StartCompilerSession
  readonly envs = new Map<string, EnvState>()
  /** Readers of files through the compilers' input file systems (virtual modules included), by environment. */
  readonly inputFileSystems = new Map<
    string,
    (file: string) => Promise<string | null>
  >()
  /**
   * The resolver of each environment, for its compiles and its
   * invalidations: the one a loader's `getResolve()` gives, asked outside
   * any loader (Rspack would record every file it looks at as a dependency
   * of the module compiling).
   */
  readonly resolvers = new Map<
    string,
    (importerDir: string, specifier: string) => Promise<string | null>
  >()
  /**
   * Tells each environment's compiler that files changed (it builds their
   * modules again): the compilation it is starting, or its next one.
   */
  readonly rebuilders = new Map<string, (paths: Array<string>) => void>()

  constructor(opts: StartRsbuildSessionOptions) {
    for (const env of opts.environments) {
      this.envs.set(env.name, {
        name: env.name,
        type: env.type,
        transformImport: [],
        compiled: new Set(),
        recordMapText: null,
        persistsModules: false,
      })
    }
    this.start = new StartCompilerSession({
      ...opts,
      // the server environment provides the server functions (under RSC,
      // its RSC layer: `rscLayer`)
      providerEnv: RSBUILD_ENVIRONMENT_NAMES.server,
      hmrStyle: 'webpack',
      edgeModuleIds: rspackEdgeModuleIds(
        `${normalizePath(opts.root)}/node_modules/.virtual/tanstack-start/import-protection`,
      ),
      readFile: (file) => this.readFile(file),
      // our virtual modules are files of the compilers' input file systems
      loadVirtual: () => Promise.resolve(null),
      label: 'start:rsbuild',
    })
    registerCompilerStats('start:rsbuild:host', this, (o) =>
      collectionSizes({ envs: o.envs, missing: o.missing }, 4),
    )
  }

  env(name: string): EnvState {
    const env = this.envs.get(name)
    if (!env) {
      throw new Error(`[tanstack-start] unknown Rsbuild environment "${name}"`)
    }
    return env
  }

  /**
   * Reads a file: our virtual modules through the compilers' input file
   * systems (Rspack's virtual files), real files from the disk (the input
   * file system caches across a watch compilation; the disk is the truth
   * of an edited dependency).
   */
  async readFile(file: string): Promise<string | null> {
    if (file.includes('/node_modules/.virtual/')) {
      for (const read of this.inputFileSystems.values()) {
        const text = await read(file)
        if (text !== null) {
          return text
        }
      }
      return null
    }
    try {
      return await fs.promises.readFile(file, 'utf8')
    } catch {
      this.missing.add(file)
      return null
    }
  }

  /** Paths a read found missing (their raw facts say so until an event or `forgetMisses`). */
  private readonly missing = new Set<string>()

  /** Drops every missing-file fact (a file may appear without an event: nothing watches it). */
  forgetMisses(): void {
    for (const file of this.missing) {
      this.start.rawFacts.markStale(file)
    }
    this.missing.clear()
  }

  /** The import rewrite of an environment (`source.transformImport`), when it has one. */
  private importRewrite(env: EnvState): ImportRewrite | undefined {
    const rules = env.transformImport
    if (rules.length === 0) {
      return undefined
    }
    return (specifier, names) => {
      const rule = rules.find((r) => r.libraryName === specifier)
      if (!rule) {
        return null
      }
      const members = names.filter((n) => n !== 'default' && n !== '*')
      if (members.length === 0 || names.includes('*')) {
        return null
      }
      const out: Array<string> = []
      for (const member of members) {
        if (rule.ignoreEsComponent?.includes(member)) {
          out.push(specifier)
          continue
        }
        out.push(rewrittenSpecifier(rule, member))
      }
      return out
    }
  }

  private readonly hosts = new Map<string, HostServices>()

  /** The host services of an environment's compiles and invalidations (its own resolver: aliases and conditions differ). */
  private hostFor(envName: string): HostServices {
    let host = this.hosts.get(envName)
    if (!host) {
      const resolve = this.resolvers.get(envName)
      if (!resolve) {
        throw new Error(
          `[tanstack-start] no resolver for the Rsbuild environment "${envName}"`,
        )
      }
      host = this.start.host(
        async (specifier, importer) => {
          const id = await resolve(
            path.dirname(identify(importer).path),
            specifier,
          )
          return id === null ? null : { id }
        },
        { importRewrite: this.importRewrite(this.env(envName)) },
      )
      this.hosts.set(envName, host)
    }
    return host
  }

  /** Per environment: the files its last compilation depended on (dev; see `retain`). */
  private readonly liveFiles = new Map<string, ReadonlySet<string>>()

  /**
   * After an environment's dev compilation: forget what the session holds of
   * files the compilation no longer depends on (plans, raw facts, import
   * protection's importer records). Rspack reports a deleted file only while a module depends on it,
   * so a module the app stopped importing and then deleted never gets its
   * `unlink`; without this its state stayed for the session (every cache
   * must stay bounded by the live modules). The same files as the last
   * compilation's (an edit): nothing to forget.
   */
  retain(envName: string, files: Iterable<string>): void {
    const live = new Set<string>()
    for (const f of files) {
      live.add(normalizePath(f))
    }
    const before = this.liveFiles.get(envName)
    this.liveFiles.set(envName, live)
    if (before?.size === live.size && [...live].every((f) => before.has(f))) {
      return
    }
    const isFile = (path: string) =>
      path.startsWith('/') || /^[A-Za-z]:\//.test(path)
    const keepIn =
      (set: (path: string) => boolean) =>
      (path: string): boolean =>
        !isFile(path) || path.includes('/node_modules/.virtual/') || set(path)
    const keepEnv = keepIn((p) => live.has(p))
    const plans = this.start.caches.plans.get(envName)
    if (plans) {
      for (const key of plans.keys()) {
        if (!keepEnv(identify(key.canonicalId).path)) {
          plans.delete(key)
        }
      }
    }
    this.start.ip?.retain(keepEnv, envName)
    if (this.liveFiles.size === this.envs.size) {
      // shared state: kept while any environment depends on the file
      const anyEnv = keepIn((p) =>
        [...this.liveFiles.values()].some((set) => set.has(p)),
      )
      this.start.rawFacts.retain((id) => anyEnv(identify(id).path))
      this.start.ip?.retain(anyEnv)
    }
  }

  /**
   * After the last pass of an environment's production build: releases
   * its plans and its import protection. What the environments share
   * (raw facts, registry, id allocator, warnings) stays.
   */
  release(envName: string): void {
    this.start.release(envName)
    const env = this.envs.get(envName)
    if (env) {
      env.compiled = new Set()
    }
  }

  /**
   * The one invalidation operation (compiler plans and bundler modules
   * together): the caller has the modules of the stale dependents built
   * again (`rebuildDependents`, a registry change's listeners).
   */
  invalidate(
    file: string,
    kind: InvalidateChange['kind'],
  ): Promise<{ evicted: Array<PlanKey>; dependents: Array<PlanKey> }> {
    return invalidate(
      this.start.caches,
      { path: normalizePath(file), kind },
      (env) => this.hostFor(env),
    )
  }

  /**
   * The last file event invalidated per path (`kind:mtime:size`, or
   * `unlink`), and the end of the invalidation it was part of.
   */
  private readonly lastEvent = new Map<
    string,
    { stamp: string; done: Promise<void> }
  >()

  /**
   * The invalidation of a compilation's file events, once per logical
   * change: every environment compiler of the cycle reports the same
   * modified and removed files, and a second invalidation of the same
   * change would evict the plans the first compiler just rebuilt and
   * restart the compiles in flight (a compiler seeing a change another one
   * is invalidating waits for it). The modules of the dependents it finds
   * stale are built again (`rebuildDependents`).
   */
  async invalidateFileEvents(
    events: ReadonlyArray<{ file: string; kind: FileEventKind }>,
  ): Promise<void> {
    const others: Array<Promise<void>> = []
    const mine: Array<{ file: string; kind: FileEventKind }> = []
    let end!: () => void
    const done = new Promise<void>((resolve) => (end = resolve))
    for (const event of events) {
      const stamp = stampOf(event.file, event.kind)
      const last = this.lastEvent.get(event.file)
      if (last?.stamp === stamp) {
        others.push(last.done)
      } else {
        this.lastEvent.set(event.file, { stamp, done })
        mine.push(event)
      }
    }
    try {
      const stale: Array<PlanKey> = []
      for (const { file, kind } of mine) {
        stale.push(...(await this.invalidate(file, kind)).dependents)
        if (kind === 'unlink') {
          this.start.forget(normalizePath(file))
        }
      }
      this.rebuildDependents(stale)
    } finally {
      end()
    }
    await Promise.all(others)
  }

  /**
   * Has each environment compiler build again the modules of its stale
   * plans (`rebuilders`): Rspack builds a module for a change of its own
   * file only, so it is told their files changed. That change is no new
   * event (the files are as the invalidation saw them): recorded as
   * invalidated.
   */
  private rebuildDependents(keys: ReadonlyArray<PlanKey>): void {
    if (keys.length === 0) {
      return
    }
    const done = Promise.resolve()
    for (const [env, rebuild] of this.rebuilders) {
      const paths = pathsOf(keys, env)
      for (const file of paths) {
        this.lastEvent.set(file, { stamp: stampOf(file, 'change'), done })
      }
      rebuild(paths)
    }
  }

  /** The files the plans of an environment's modules at `paths` read, but the modules' own (`planDependencyFiles`). */
  dependencyFiles(envName: string, paths: ReadonlySet<string>): Array<string> {
    return [...planDependencyFiles(this.start.caches, envName, paths)].filter(
      (file) => !paths.has(file) && path.isAbsolute(file),
    )
  }

  /**
   * The plans an earlier process persisted with an environment's modules
   * (`PLAN_BUILD_INFO_FIELD`), which Rspack's persistent cache restored
   * without a compile: each one compiled with this session's configuration
   * and whose dependencies are all current joins the session's plans
   * (`restorePlans`); returns the files of the others, whose modules are
   * to be built again.
   */
  async restorePlans(
    envName: string,
    modules: Iterable<{ plan: PersistedPlan; layer: string | undefined }>,
  ): Promise<Set<string>> {
    const env = this.env(envName)
    const current = new Map<string, PersistedPlan>()
    const stale: Array<PlanKey> = []
    for (const { plan, layer } of modules) {
      if (this.start.configured(plan.key.configKey, env, layer)) {
        current.set(planKeyString(plan.key), plan)
      } else {
        stale.push(plan.key)
      }
    }
    stale.push(
      ...(await restorePlans(this.start.caches, current.values(), (name) =>
        this.hostFor(name),
      )),
    )
    return new Set(pathsOf(stale))
  }

  /** Whether a compilation of any environment finished (the hosts set it at `done`). */
  compiledOnce = false
  private readonly registryInvalidations = new WeakMap<
    ReadonlyArray<string>,
    Promise<Array<string>>
  >()

  /**
   * The one invalidation of a registry change (`files`: the publication's
   * changed route files, the same array for every listener): the paths whose
   * modules the environment compilers must build again (the files, and the
   * evicted and dependent plans' files), once per publication.
   */
  registryChanged(files: ReadonlyArray<string>): Promise<Array<string>> {
    let pending = this.registryInvalidations.get(files)
    if (!pending) {
      pending = Promise.all(
        files.map((file) => this.invalidate(file, 'registry')),
      ).then((results) => [
        ...new Set([
          ...files.map(normalizePath),
          ...pathsOf(results.flatMap((r) => [...r.evicted, ...r.dependents])),
        ]),
      ])
      this.registryInvalidations.set(files, pending)
    }
    return pending
  }

  /**
   * The loader implementation: compiles every id (env and derived) of a
   * JS/TS module of an environment from the text Rspack hands it (never
   * from a path-only "latest plan", so upstream loaders and maps compose),
   * composes maps with the input map, records dependencies, server-fn
   * facts (`buildInfo`, for the replay) and import-protection records, and
   * reports diagnostics.
   */
  async compile(
    ctx: LoaderContextLike,
    source: string,
    inputMap: unknown,
    options: LoaderOptions,
  ): Promise<LoaderResult> {
    const env = this.env(options.environment)
    const passthrough: LoaderResult = { code: source, map: inputMap }
    const { ip } = this.start
    if (options.pass === 'edge') {
      // dev: the bundler requested this edge module from the importer's
      // post-SWC code; a veto serves the real module
      const ipEnv = ip?.env(env.name, env.type)
      env.compiled.add(ctx.resource)
      const error = await ipEnv?.confirm(ctx.resource)
      if (error) {
        throw error
      }
      return { code: ip?.load(ctx.resource)?.code ?? source, map: null }
    }
    const id = canonicalResource(ctx.resource)
    if (options.pass === 'asset') {
      // never compiled, and an import the compiler does not read may have
      // brought it here: a denied file's text is served as its mock
      const asset = await this.start.assetOutput(env, id)
      return (
        (asset && (await this.protect(ctx, env, id, asset))) ?? {
          code: '',
          map: null,
        }
      )
    }
    const identity = identify(id)
    // (the late pass is registered only with import protection on)
    const late = options.pass === 'late'
    if (late ? identity.lang !== null : identity.lang === null) {
      return passthrough
    }
    if (!late && !this.start.compiles(identity.path, source)) {
      return passthrough
    }
    let parsedInputMap: InputSourceMap | null | undefined
    const readInputMap = (): InputSourceMap | null => {
      if (parsedInputMap === undefined) {
        parsedInputMap =
          typeof inputMap === 'string'
            ? (JSON.parse(inputMap) as InputSourceMap)
            : ((inputMap as InputSourceMap | undefined) ?? null)
      }
      return parsedInputMap
    }
    const out = await this.start.compile(
      {
        id,
        code: source,
        env,
        layer: ctx._module?.layer ?? undefined,
        inputMap: readInputMap,
        wantMap: ctx.sourceMap !== false,
        late,
      },
      this.hostFor(env.name),
    )
    if (!out) {
      return passthrough
    }
    this.reportDiagnostics(ctx, out, identity.path, source, env.type)
    const mock = await this.protect(ctx, env, id, out)
    const buildInfo = ctx._module?.buildInfo
    if (env.persistsModules && out.persisted && buildInfo) {
      // one string: Rspack converts a structured field value by value
      buildInfo[PLAN_BUILD_INFO_FIELD] = JSON.stringify(out.persisted)
    }
    const serverFns = serverFnFactsOf(out)
    if (serverFns && buildInfo) {
      buildInfo[SERVER_FN_BUILD_INFO_FIELD] = {
        version: 2,
        canonicalId: identity.canonicalId,
        facts: serverFns,
      } satisfies ServerFnBuildInfo
    }
    if (mock) {
      return mock
    }
    if (identity.derived === null && out.code === source) {
      return passthrough
    }
    return {
      code: out.code,
      map: composeLoaderMap(
        out.map,
        ctx.resourcePath,
        source,
        inputMap,
        env.recordMapText,
      ),
    }
  }

  /**
   * What follows a compile: the registry, and import protection's edges and,
   * in development, the violations of this compile (with `log: 'always'`,
   * decided at every compile), recorded in the module's `buildInfo`. The
   * module that is its own violation is served as its mock (returned), whose
   * virtual file a verdict rewrites (so the module is built again as it is).
   */
  private async protect(
    ctx: LoaderContextLike,
    env: EnvState,
    id: string,
    out: CompiledOutputLike,
  ): Promise<LoaderResult | null> {
    env.compiled.add(ctx.resource)
    const outcome = this.start.afterCompile(env, id, out)
    const { error, mock } = outcome instanceof Promise ? await outcome : outcome
    if (error) {
      throw error
    }
    const buildInfo = ctx._module?.buildInfo
    const ipEnv = this.start.ip?.env(env.name, env.type)
    if (ipEnv && buildInfo) {
      const info = ipEnv.buildInfo(id, out)
      if (info) {
        buildInfo[info.key] = info.value
      } else {
        // a rebuild of a module that was its own violation
        delete buildInfo[RSPACK_BUILD_INFO_KEY]
      }
    }
    if (!mock) {
      return null
    }
    ctx.addDependency(mock.id)
    return { code: mock.code, map: null }
  }

  /** Reports a compile's diagnostics: warnings to the loader context, the errors thrown together (the module fails). */
  private reportDiagnostics(
    ctx: LoaderContextLike,
    out: CompileOutput,
    file: string,
    code: string,
    envType: 'client' | 'server',
  ): void {
    // the position in the Vite host's form, `message (file:line:col)`
    const where = (at: DiagnosticPosition | undefined) =>
      at ? ` (${file}:${at.line}:${at.column + 1})` : ''
    const errors: Array<string> = []
    this.start.report(out, file, code, envType, {
      error: (d, at) => errors.push(`${d.message}${where(at)}`),
      warn: (d, at) => {
        const warning = new Error(`${d.message}${where(at)}`)
        warning.name = 'TanStackStartCompilerWarning'
        ctx.emitWarning(warning)
      },
    })
    if (errors.length > 0) {
      const error = new Error(errors.join('\n'))
      error.name = 'TanStackStartCompilerError'
      throw error
    }
  }

  /**
   * The resolver module of an environment: the registry's manifest, gated
   * to client-referenced entries in production builds whose SSR
   * environment is the provider (J4.2); in development every entry, with a
   * warning for a client call of a function no client module references
   * (the client compilation's replay rewrites the resolver, so the flags
   * follow the client graph). The RSC provider lists its environment's
   * functions (the RSC build order).
   */
  resolverModule(): string {
    const { opts } = this.start
    return manifestResolverModule({
      entries: this.start.registry.entries(),
      providerModuleId,
      clientReferencedOnly: opts.mode === 'build' && opts.rsc === undefined,
      warnUnreferenced: opts.mode === 'dev' && opts.rsc === undefined,
      staticImports: opts.rsc !== undefined && opts.mode === 'dev',
      memoizeModules: opts.mode === 'build',
      // RSC build (J4.2): the RSC coordinator interleaves the server and client
      // compilations, so the manifest is generated before the client's
      // references are known; it lists every function (server-origin calls
      // reach the provider through it) and gates client-origin calls on a
      // set the server asset pipeline fills in once the client build exists
      clientOriginGate:
        opts.mode === 'build' && opts.rsc !== undefined
          ? JSON.stringify(CLIENT_REFERENCED_IDS_PLACEHOLDER)
          : undefined,
    })
  }

  /** The JSON array of client-referenced function ids (the gate's set, J4.2). */
  clientReferencedIdsLiteral(): string {
    return JSON.stringify(
      this.start.registry
        .entries()
        .filter((e) => e.clientReferenced)
        .map((e) => e.id)
        .sort(),
    )
  }
}

/** A file event of a compilation: an edit, a creation, a removal. */
export type FileEventKind = 'change' | 'add' | 'unlink'

/** A file event's record (`lastEvent`): its kind and the file as it is now. */
function stampOf(file: string, kind: FileEventKind): string {
  if (kind === 'unlink') {
    return kind
  }
  const stat = fs.statSync(file, { throwIfNoEntry: false })
  return stat ? `${kind}:${stat.mtimeMs}:${stat.size}` : kind
}

/**
 * A module resource as a compiler id. Rspack's RSC plugin requests a
 * `'use server-entry'` module's original content under its own query,
 * appended with a second `?` (`file?tss-serverfn-split?rsc-server-entry-proxy=true`):
 * the identity parser reads one query, so later `?` become `&`, and that
 * query names no other source (the same text, the same plan: the server fn
 * registry must point the resolver at `file?tss-serverfn-split`), so it is
 * dropped.
 */
export function canonicalResource(resource: string): string {
  const normalized = webpackResourceId(resource)
  const q = normalized.indexOf('?')
  if (q === -1) {
    return normalized
  }
  const query = normalized
    .slice(q + 1)
    .replace(/\?/g, '&')
    .split('&')
    .filter((part) => part !== '' && !part.startsWith(RSC_PROXY_QUERY))
    .join('&')
  return query.length > 0
    ? `${normalized.slice(0, q)}?${query}`
    : normalized.slice(0, q)
}

/** Rspack's RSC plugin's query on a server entry's original module. */
const RSC_PROXY_QUERY = 'rsc-server-entry-proxy'

const camelToDash = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

/** The specifier Rsbuild's `source.transformImport` turns a member import into (its documented defaults). */
function rewrittenSpecifier(rule: TransformImportRule, member: string): string {
  if (typeof rule.customName === 'function') {
    return rule.customName(member) ?? rule.libraryName
  }
  const transformed =
    rule.camelToDashComponentName === false ? member : camelToDash(member)
  if (typeof rule.customName === 'string') {
    return rule.customName.replace(
      /\{\{\s*(?:(\w+)\s+)?member\s*\}\}/g,
      (_m, helper: string | undefined) => {
        switch (helper) {
          case 'kebabCase':
            return camelToDash(member)
          case 'camelCase':
            return member.charAt(0).toLowerCase() + member.slice(1)
          case 'snakeCase':
            return camelToDash(member).replace(/-/g, '_')
          case 'upperCase':
            return member.toUpperCase()
          case 'lowerCase':
            return member.toLowerCase()
          default:
            return member
        }
      },
    )
  }
  const dir = rule.libraryDirectory ?? 'lib'
  return `${rule.libraryName}/${dir}/${transformed}`
}
