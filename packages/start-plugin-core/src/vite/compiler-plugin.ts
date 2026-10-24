/**
 * Start's Vite host of the compiler core (DESIGN §4.1; D8, R3, R11, R35):
 * one `enforce: 'pre'` plugin per Start env compiling every id it is handed
 * text for through `compileModule` (env and derived ids alike), the one
 * invalidation operation on `hotUpdate`, the server-fn registry shared by
 * the envs, the dev lookup and production resolver modules, and the
 * custom-id patching at `renderChunk`.
 *
 * INTERIM composition (until the router and Hydrate planners land): the
 * router splitter's `?tsr-split=` ids compile as their source (the splitter
 * consumes this plugin's output as today), and the Babel `<Hydrate>`
 * transform runs as a post-pass (`hydrate-interim.ts`).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import {
  OutputBuilder,
  RawFactsCache,
  SourceText,
  WarningLedger,
  compileModule,
  createCompilerCaches,
  deriveId,
  digestOf,
  identify,
  invalidate,
} from '@tanstack/router-utils/compiler'
import {
  COMPILER_RESOLVE_CUSTOM_KEY,
  TRANSFORM_ID_REGEX,
  VITE_ENVIRONMENT_NAMES,
} from '../constants'
import { startRecognizer } from '../compiler/recognizer'
import { START_ENV, startPlanners } from '../planners'
import { FunctionIdAllocator, decodeDevFunctionId } from '../server-fns/ids'
import { ServerFnRegistry } from '../server-fns/registry'
import {
  SERVER_FN_LOOKUP_VIRTUAL_ID,
  devLookupModule,
  devResolverModule,
  productionResolverModule,
} from '../server-fns/resolver'
import { MissingHydrateSourceError } from '../hydrate-when-transform'
import { createVirtualModule } from './createVirtualModule'
import { createInterimHydrate } from './hydrate-interim'
import type { InterimHydrateEnv } from './hydrate-interim'
import type { GenerateFunctionId } from '../server-fns/ids'
import type { ServerFnEntry } from '../server-fns/registry'
import type { RscCssConfig, StartEnvConfig, StartEnvFacts } from '../planners'
import type { CompileStartFrameworkOptions } from '../types'
import type {
  CompilerCaches,
  Diagnostic,
  EnvInfo,
  HostServices,
  Planner,
  RawSourceMap,
} from '@tanstack/router-utils/compiler'
import type {
  Environment,
  EnvironmentModuleNode,
  Plugin,
  PluginOption,
} from 'vite'

export interface StartRscCompilerOptions {
  /** The RSC host's CSS loader expression (`import.meta.viteRsc.loadCss()`). */
  loadCssExpression: string
  /** The directive derived provider modules carry, if any. */
  providerDirective?: string
}

export interface StartCompilerPluginOptions {
  framework: CompileStartFrameworkOptions
  environments: Array<{
    name: string
    type: 'client' | 'server'
    getServerFnById?: string
  }>
  generateFunctionId?: GenerateFunctionId
  /** The Vite environment name of the server function provider. */
  providerEnvName: string
  rsc?: StartRscCompilerOptions | undefined
}

const PROVIDER_QUERY = 'tss-serverfn-split'
const HYDRATE_INTERIM_KEY = 'tss-hydrate-interim'

/** The specifier of a module id for the dev module runner: root-relative, or `/@fs/` for files outside the root. */
export function toDevSpecifier(id: string, root: string): string {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  const normalized = id.replace(/\\/g, '/')
  if (normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized.slice(normalizedRoot.length)
  }
  return normalized.startsWith('/') ? `/@fs${normalized}` : `/@fs/${normalized}`
}

export function startCompilerPlugin(
  opts: StartCompilerPluginOptions,
): PluginOption {
  const recognizer = startRecognizer()
  const ssrIsProvider = opts.providerEnvName === VITE_ENVIRONMENT_NAMES.server
  const resolverEnvironments = new Set(
    ssrIsProvider
      ? [opts.providerEnvName]
      : [VITE_ENVIRONMENT_NAMES.server, opts.providerEnvName],
  )
  let root = process.cwd()
  let bundledDev = false

  /** Per-env loaders of genuinely virtual ids (the dev plugin container, or `this.load` in a build). */
  const virtualLoaders = new Map<
    string,
    (id: string) => Promise<string | null>
  >()
  const rawFacts = new RawFactsCache({
    readFile: async (file) => {
      try {
        return await fs.readFile(file, 'utf8')
      } catch {
        return null
      }
    },
    loadVirtual: async (id) => {
      for (const load of virtualLoaders.values()) {
        const code = await load(id).catch(() => null)
        if (code !== null) {
          return code
        }
      }
      return null
    },
    recognizer,
  })
  const caches: CompilerCaches = createCompilerCaches(rawFacts)
  const registry = new ServerFnRegistry()
  const warnings = new WarningLedger(() => {})
  const allocator = opts.generateFunctionId
    ? new FunctionIdAllocator(opts.generateFunctionId)
    : null
  const hydrate = createInterimHydrate({
    framework: opts.framework,
    root: () => root,
    providerEnvName: opts.providerEnvName,
  })
  /** One compiler invalidation per watcher event, applied by every env's `hotUpdate`. */
  const invalidations = new Map<
    string,
    Promise<Awaited<ReturnType<typeof invalidate>>>
  >()

  /** Pre-bundled dependencies are opaque (a discovered Start library is never pre-bundled); everything else resolved is read. */
  const isOpaque = (canonicalId: string): boolean =>
    identify(canonicalId)
      .path.replace(/\\/g, '/')
      .includes('/node_modules/.vite/')

  const envInfoOf = (
    environment: Environment,
    env: { name: string; type: 'client' | 'server' },
  ): EnvInfo => ({
    name: env.name,
    type: env.type,
    isProvider: env.name === opts.providerEnvName,
    mode: environment.mode === 'build' ? 'build' : 'dev',
    bundler: 'vite',
    framework: opts.framework,
    conditions: environment.config.resolve.conditions,
    routerSplit: env.type === 'client',
  })

  const plannersByEnv = new Map<string, Array<Planner>>()
  const plannersFor = (env: { name: string }): Array<Planner> => {
    let p = plannersByEnv.get(env.name)
    if (!p) {
      p = startPlanners({
        rscCss: opts.rsc !== undefined && env.name === opts.providerEnvName,
      })
      plannersByEnv.set(env.name, p)
    }
    return p
  }

  const configFor = (envInfo: EnvInfo) => {
    const idMode: StartEnvConfig['idMode'] =
      envInfo.mode === 'dev' ? 'dev' : allocator ? 'placeholder' : 'default'
    const startEnv: StartEnvConfig = {
      framework: opts.framework,
      root,
      providerSeparate: !ssrIsProvider,
      idMode,
      providerDirective: opts.rsc?.providerDirective,
      isOpaque,
    }
    const rscCss: RscCssConfig | undefined = opts.rsc
      ? { loadCssExpression: opts.rsc.loadCssExpression }
      : undefined
    return {
      configKey: digestOf({
        framework: opts.framework,
        root,
        provider: opts.providerEnvName,
        ssrIsProvider,
        idMode,
        rsc: opts.rsc ?? null,
        env: envInfo.name,
      }),
      perPlanner: { [START_ENV]: startEnv, 'rsc-css': rscCss } as Record<
        string,
        unknown
      >,
    }
  }

  /** Host services bound to one hook context. */
  const hostFor = (ctx: {
    resolve: (
      source: string,
      importer?: string,
      options?: { skipSelf?: boolean; custom?: Record<string, unknown> },
    ) => Promise<{ id: string; external?: boolean | string } | null>
    environment: Environment
  }): HostServices => ({
    resolve: async (specifier, importer) => {
      const r = await ctx.resolve(specifier, importer, {
        skipSelf: true,
        custom: { [COMPILER_RESOLVE_CUSTOM_KEY]: true },
      })
      if (!r) {
        return null
      }
      return {
        id: r.id,
        external: r.external === true || typeof r.external === 'string',
      }
    },
    readFile: (file) => fs.readFile(file, 'utf8').catch(() => null),
    loadVirtual: (id) =>
      virtualLoaders.get(ctx.environment.name)?.(id) ?? Promise.resolve(null),
    rawFacts,
    warnings,
  })

  const providerModuleIdOf = (e: ServerFnEntry): string =>
    e.providerDerived
      ? deriveId(e.definingCanonicalId, { kind: 'provider', value: '' })
      : e.definingCanonicalId

  /** A diagnostic's location: 1-based line, 0-based column, counting every ECMAScript line terminator. */
  const locationOf = (
    source: SourceText,
    filePath: string,
    d: Diagnostic,
  ): { file: string; line: number; column: number } | undefined => {
    if (!d.range) {
      return undefined
    }
    const { line, column } = source.locate(d.range.start)
    return { file: filePath, line: line + 1, column }
  }
  const reportDiagnostics = (
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
    diagnostics: ReadonlyArray<Diagnostic>,
    filePath: string,
    id: string,
    code: string,
  ) => {
    if (diagnostics.length === 0) {
      return
    }
    const source = new SourceText(code)
    for (const d of diagnostics) {
      if (d.severity === 'error') {
        const loc = locationOf(source, filePath, d)
        ctx.error({
          message: loc
            ? `${d.message} (${filePath}:${loc.line}:${loc.column + 1})`
            : d.message,
          id,
          loc,
        })
      }
    }
    for (const d of diagnostics) {
      if (d.severity === 'warning' && warnings.once(filePath, d)) {
        const loc = locationOf(source, filePath, d)
        ctx.warn({
          message: loc
            ? `${d.message} (${filePath}:${loc.line}:${loc.column + 1})`
            : d.message,
          loc,
        })
      }
    }
  }

  function perEnvPlugin(env: {
    name: string
    type: 'client' | 'server'
  }): Plugin {
    return {
      name: `tanstack-start:compiler:${env.name}`,
      enforce: 'pre',
      perEnvironmentWatchChangeDuringDev: true,
      applyToEnvironment(e) {
        return e.name === env.name
      },
      configResolved(config) {
        root = config.root
        bundledDev = !!config.experimental.bundledDev
      },
      buildStart() {
        if (this.environment.mode === 'build' && env.type === 'client') {
          // a new build: the registry of the previous one is gone (the client builds first)
          registry.clear()
        }
        const environment = this.environment
        virtualLoaders.set(env.name, async (id) => {
          if (environment.mode === 'dev') {
            const loaded = await environment.pluginContainer.load(id)
            if (loaded === null || loaded === undefined) {
              return null
            }
            return typeof loaded === 'string' ? loaded : loaded.code
          }
          const info = await this.load({ id })
          return info.code
        })
      },
      transform: {
        filter: { id: { include: TRANSFORM_ID_REGEX } },
        async handler(code, id) {
          const identity = identify(id)
          if (identity.lang === null) {
            return null
          }
          const environment = this.environment
          const envInfo = envInfoOf(environment, env)
          // INTERIM: router split ids compile as their source; Hydrate chunks as their own source
          let compileId = id
          if (identity.derived) {
            if (identity.derived.kind === 'hydrate') {
              compileId = id.replace(
                /([?&])tss-hydrate=/,
                `$1${HYDRATE_INTERIM_KEY}=`,
              )
            } else if (identity.derived.kind !== 'provider') {
              compileId = identity.canonicalId
            }
          }
          const host = hostFor(this)
          const out = await compileModule(
            {
              id: compileId,
              code,
              env: envInfo,
              planners: plannersFor(env),
              config: configFor(envInfo),
              // always: downstream plugins read positions through the combined map (import
              // protection's reported locations), whatever `build.sourcemap` says
              wantMap: true,
            },
            host,
            caches,
          )
          let result: { code: string; map: RawSourceMap | null } | null = null
          if (out) {
            reportDiagnostics(this, out.diagnostics, identity.path, id, code)
            const facts = out.facts.planners[START_ENV] as
              | StartEnvFacts
              | undefined
            if (facts && facts.serverFns.length > 0) {
              registry.record(identity.canonicalId, facts.serverFns, env.type)
            }
            if (out.code !== code) {
              result = { code: out.code, map: out.map }
            }
          }
          // INTERIM: today's Hydrate transform on the output
          const hydrateEnv: InterimHydrateEnv = {
            type: env.type,
            name: env.name,
            mode: envInfo.mode,
          }
          const hydrated = hydrate.transform(
            result?.code ?? code,
            id,
            hydrateEnv,
            result?.map ?? null,
          )
          if (hydrated) {
            result = hydrated
          }
          if (!result) {
            return null
          }
          return {
            code: result.code,
            map: result.map as never,
            moduleSideEffects: out?.sideEffectFree ? false : undefined,
          }
        },
      },
      async hotUpdate(ctx) {
        const change = {
          path: ctx.file,
          kind:
            ctx.type === 'delete'
              ? ('unlink' as const)
              : ctx.type === 'create'
                ? ('add' as const)
                : ('change' as const),
        }
        const key = `${ctx.file}\u0000${ctx.timestamp}`
        let pending = invalidations.get(key)
        if (!pending) {
          const environment = this.environment
          pending = invalidate(caches, change, {
            resolve: async (specifier, importer) => {
              const r = await environment.pluginContainer.resolveId(
                specifier,
                importer,
                { custom: { [COMPILER_RESOLVE_CUSTOM_KEY]: true } },
              )
              return r ? { id: r.id, external: r.external === true } : null
            },
            readFile: (file) => fs.readFile(file, 'utf8').catch(() => null),
            loadVirtual: (id) =>
              virtualLoaders.get(env.name)?.(id) ?? Promise.resolve(null),
            rawFacts,
            warnings,
          })
          invalidations.set(key, pending)
          setTimeout(() => invalidations.delete(key), 10_000).unref()
        }
        const res = await pending
        hydrate.invalidate(ctx.file, env.name)
        if (ctx.type === 'delete') {
          registry.forget(ctx.file)
        }
        const seen = new Set<EnvironmentModuleNode>()
        const extra: Array<EnvironmentModuleNode> = []
        for (const k of [...res.evicted, ...res.dependents]) {
          if (k.env !== env.name) {
            continue
          }
          const p = identify(k.canonicalId).path
          if (p === ctx.file) {
            continue
          }
          for (const m of this.environment.moduleGraph.getModulesByFile(p) ??
            []) {
            this.environment.moduleGraph.invalidateModule(
              m,
              seen,
              ctx.timestamp,
              true,
              false,
            )
            extra.push(m)
          }
        }
        return extra.length > 0 ? [...ctx.modules, ...extra] : undefined
      },
      async watchChange(id, change) {
        if (!bundledDev || this.environment.mode !== 'dev') {
          return
        }
        const kind =
          change.event === 'delete'
            ? 'unlink'
            : change.event === 'create'
              ? 'add'
              : 'change'
        const environment = this.environment
        const res = await invalidate(
          caches,
          { path: id, kind },
          {
            resolve: async (specifier, importer) => {
              const r = await environment.pluginContainer.resolveId(
                specifier,
                importer,
                { custom: { [COMPILER_RESOLVE_CUSTOM_KEY]: true } },
              )
              return r ? { id: r.id, external: r.external === true } : null
            },
            readFile: (file) => fs.readFile(file, 'utf8').catch(() => null),
            loadVirtual: (vid) =>
              virtualLoaders.get(env.name)?.(vid) ?? Promise.resolve(null),
            rawFacts,
            warnings,
          },
        )
        hydrate.invalidate(id, env.name)
        const graph = environment.moduleGraph
        const seen = new Set<EnvironmentModuleNode>()
        for (const k of [...res.evicted, ...res.dependents]) {
          if (k.env !== env.name) {
            continue
          }
          for (const m of graph.getModulesByFile(
            identify(k.canonicalId).path,
          ) ?? []) {
            graph.invalidateModule(m, seen, Date.now(), true, false)
          }
        }
      },
      renderChunk(code, chunk) {
        if (!allocator || !code.includes('__TSS_FN_ID_')) {
          return null
        }
        const entries = registry.entries()
        allocator.allocate(
          env.type === 'client'
            ? entries.filter((e) => e.clientReferenced)
            : entries,
        )
        const patched = allocator.patch(code)
        if (patched.missing.length > 0) {
          this.error({
            message: `Server function ids could not be resolved in ${chunk.fileName}: ${patched.missing.join(', ')}`,
          })
        }
        const source = new SourceText(code)
        const builder = new OutputBuilder(source, chunk.fileName, { map: true })
        let pos = 0
        for (const e of patched.edits) {
          if (e.start > pos) {
            builder.copy(pos, e.start)
          }
          builder.text(e.text)
          pos = e.end
        }
        if (pos < code.length) {
          builder.copy(pos, code.length)
        }
        const built = builder.finish()
        return { code: built.code, map: built.map as never }
      },
    }
  }

  const lookupPrefix = `\0${SERVER_FN_LOOKUP_VIRTUAL_ID}?`
  const devLookupPlugin: Plugin = {
    name: 'tanstack-start:server-fn-lookup',
    apply: 'serve',
    applyToEnvironment(e) {
      return resolverEnvironments.has(e.name)
    },
    resolveId(source) {
      if (source.startsWith(`${SERVER_FN_LOOKUP_VIRTUAL_ID}?`)) {
        return `\0${source}`
      }
      return undefined
    },
    async load(id) {
      if (!id.startsWith(lookupPrefix)) {
        return undefined
      }
      const fnId =
        new URLSearchParams(id.slice(lookupPrefix.length)).get('id') ?? ''
      let entry = registry.get(fnId)
      if (!entry) {
        // a fresh server: compile the defining module through the normal transform
        const key = decodeDevFunctionId(fnId)
        if (key && this.environment.mode === 'dev') {
          const abs = path.resolve(root, key.rootRel)
          await this.environment.transformRequest(abs).catch(() => null)
          entry = registry.get(fnId)
        }
      }
      if (!entry) {
        this.error(`Invalid server function ID: ${fnId}`)
      }
      const specifier = toDevSpecifier(providerModuleIdOf(entry), root)
      return devLookupModule(entry, specifier)
    },
  }

  const resolverPlugin = createVirtualModule({
    name: 'tanstack-start:server-fn-resolver',
    moduleId: VIRTUAL_MODULES.serverFnResolver,
    enforce: 'pre',
    applyToEnvironment: (e) => resolverEnvironments.has(e.name),
    load() {
      if (this.environment.name !== opts.providerEnvName) {
        const mod = opts.environments.find(
          (e) => e.name === this.environment.name,
        )?.getServerFnById
        if (mod) {
          return mod
        }
        this.error(
          `No getServerFnById implementation found for caller environment: ${this.environment.name}`,
        )
      }
      if (this.environment.mode !== 'build') {
        return devResolverModule()
      }
      return productionResolverModule({
        entries: registry.entries(),
        providerModuleId: providerModuleIdOf,
        clientReferencedOnly: ssrIsProvider,
      })
    },
  })

  const hydrateChunkPlugin: Plugin = {
    name: 'tanstack-start:hydrate-chunk-interim',
    enforce: 'pre',
    applyToEnvironment(e) {
      return opts.environments.some((env) => env.name === e.name)
    },
    load: {
      filter: { id: hydrate.idPattern },
      async handler(id) {
        const env = opts.environments.find(
          (e) => e.name === this.environment.name,
        )
        if (!env) {
          return null
        }
        const hydrateEnv: InterimHydrateEnv = {
          type: env.type,
          name: env.name,
          mode: this.environment.mode === 'build' ? 'build' : 'dev',
        }
        const tryLoad = () => hydrate.load(id, hydrateEnv)
        try {
          return tryLoad()
        } catch (error) {
          if (!(error instanceof MissingHydrateSourceError)) {
            throw error
          }
        }
        // the parent was not compiled yet in this env (a chunk requested first): compile it
        const sourceId = identify(id).canonicalId
        if (
          this.environment.mode === 'dev' &&
          !(bundledDev && env.type === 'client')
        ) {
          await this.environment.transformRequest(sourceId)
        } else {
          await this.load({ id: sourceId })
        }
        return tryLoad()
      },
    },
  }

  return [
    ...opts.environments.map(perEnvPlugin),
    devLookupPlugin,
    resolverPlugin,
    hydrateChunkPlugin,
  ]
}

export { PROVIDER_QUERY }
