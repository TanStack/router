/**
 * Start's Vite host of the compiler core (see the core's README.md,
 * "Hosts"): one `enforce: 'pre'` plugin per Start env compiling every id it is
 * handed text for through ONE `compileModule` (env and derived ids alike)
 * with the planners in the core's fixed order — `start-env`, `hydrate`,
 * `rsc-css`, `router`, `import-edges` — the one
 * invalidation operation on `hotUpdate`, the server-fn registry shared by
 * the envs, the dev lookup and production resolver modules, the custom-id
 * patching at `renderChunk`, and import protection's host side (edge
 * modules, dev reports, build witness and reports, the late pass for non-JS
 * importers).
 *
 * The plugins share one `ViteCompilerState` (`compiler-state.ts`: the
 * session and the hooks' state). This file holds each environment's compiler
 * plugin; beside it: `invalidation.ts` (file events), `handler-reach.ts`
 * (the RSC provider's handler reach), `late-pass-plugin.ts` and
 * `server-fn-plugins.ts` (dev lookup, forward, resolver).
 */
import path from 'node:path'
import {
  ASSET_QUERY_RE,
  OWNED_QUERY_RE,
  OutputBuilder,
  SAME_FILE_SPECIFIER_RE,
  SourceText,
  identify,
  invalidate,
  isAssetId,
  isFinalBuild,
  liveModules,
  loadDerivedSource,
  normalizePath,
  resolveSameFileSpecifier,
  revision,
  rollupEntryModuleIds,
  warnEagerExports,
} from '@tanstack/router-utils/compiler'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '@tanstack/router-plugin/context'
import { TRANSFORM_ID_REGEX } from '../constants'
import { NODE_MODULES_RE, dependencyTextFilter } from '../compiler/scope'
import { isVueSfc } from '../compiler/vue'
import { resolveViteEdgeModuleId } from '../import-protection/edge-modules'
import { viteDevGraphView } from '../import-protection/graph-trace'
import {
  readRolldownWitness,
  rolldownGraphView,
} from '../import-protection/witness'
import {
  ViteCompilerState,
  cacheDirRe,
  inputMapOf,
  optimizedDependency,
} from './compiler-state'
import { compileHandlerReach } from './handler-reach'
import {
  applyInvalidation,
  changeKindOf,
  changedDependents,
  forgetFile,
  invalidateRegistry,
  invalidationHosts,
} from './invalidation'
import { ASSET_FILE_RE, latePassPlugin } from './late-pass-plugin'
import {
  devLookupPlugin,
  forwardPlugin,
  resolverPlugin,
} from './server-fn-plugins'
import type {
  InputSourceMap,
  InvalidateChange,
} from '@tanstack/router-utils/compiler'
import type { DevEnvironment, Plugin, PluginOption } from 'vite'
import type {
  StartCompilerEnvironment,
  StartCompilerPluginOptions,
} from './compiler-state'

/** A transform hook's handler (shared by the compiler's two transform hooks of an environment). */
type TransformHandler = Extract<
  NonNullable<Plugin['transform']>,
  { handler: unknown }
>['handler']

/** Specifiers of import protection's edge modules. */
const IP_SPECIFIER_RE = /tanstack-start-ip:/

export function startCompilerPlugin(
  opts: StartCompilerPluginOptions,
): PluginOption {
  const state = new ViteCompilerState(opts)
  return [
    ...opts.environments.flatMap((env) => envCompilerPlugins(state, env)),
    latePassPlugin(state),
    devLookupPlugin(state),
    forwardPlugin(state),
    resolverPlugin(state),
  ]
}

/** An environment's compiler plugin, and the one of its dependency scripts. */
function envCompilerPlugins(
  state: ViteCompilerState,
  env: StartCompilerEnvironment,
): Array<Plugin> {
  const watches = env.name === state.watchingEnv
  const compileTransform: TransformHandler = async function (code, id) {
    const identity = identify(id)
    const s = state.requireSession()
    if (identity.lang === null || !s.start.compiles(identity.path, code)) {
      return null
    }
    const environment = this.environment
    let inputMap: InputSourceMap | null | undefined
    const readInputMap = () =>
      inputMap === undefined
        ? (inputMap = inputMapOf(this, code, identity.path))
        : inputMap
    const out = await s.start.compile(
      {
        id,
        code,
        env,
        inputMap: readInputMap,
        wantMap:
          s.start.opts.mode === 'dev' ||
          environment.config.build.sourcemap !== false,
      },
      state.hostFor(
        s,
        this.environment,
        (source, imp, options) => this.resolve(source, imp, options),
        id,
      ),
    )
    if (!out) {
      return null
    }
    state.reportDiagnostics(
      s,
      this,
      out,
      identity.path,
      code,
      env.type,
      // a Vue SFC's script block, Vue's output
      isVueSfc(identity.path) ? readInputMap : undefined,
    )
    let mock = state.afterCompile(s, env, id, out, (error) => this.error(error))
    if (mock instanceof Promise) {
      mock = await mock
    }
    if (s.start.opts.mode === 'dev') {
      let digests = state.outputDigests.get(identity.path)
      if (!digests) {
        digests = new Map()
        state.outputDigests.set(identity.path, digests)
      }
      digests.set(
        `${environment.name}\0${id}`,
        revision(mock?.code ?? out.code),
      )
    }
    if (mock) {
      return { code: mock.code, map: null }
    }
    if (identity.derived === null && out.code === code) {
      return null
    }
    return {
      code: out.code,
      map: out.map as never,
      moduleSideEffects: out.sideEffectFree ? false : undefined,
    }
  }
  const plugin: Plugin = {
    name: `tanstack-start:compiler:${env.name}`,
    enforce: 'pre',
    perEnvironmentWatchChangeDuringDev: watches,
    applyToEnvironment(e) {
      return e.name === env.name
    },
    configResolved(config) {
      if (!state.session) {
        state.session = state.createSession({
          root: config.root,
          command: config.command,
          bundledDev: !!config.experimental.bundledDev,
          cacheDir: config.cacheDir,
        })
        // the optimizer's bundles are dependencies wherever the app keeps
        // them: a custom `cacheDir` is outside every `node_modules`
        state.dependencyFilter.id.include.push(
          cacheDirRe(config.cacheDir, true),
        )
        state.ownExclude.push(cacheDirRe(config.cacheDir))
        const text = dependencyTextFilter(state.session.start.ip)
        if (text) {
          state.dependencyFilter.code = text
        }
        state.unsubscribeRoutes?.()
        state.unsubscribeRoutes = onRoutesChanged(
          state.opts.routerPluginContext,
          (next, previous) => {
            for (const file of changedRoutePaths(next, previous)) {
              void invalidateRegistry(state, file).catch((error: unknown) => {
                state.server?.config.logger.error(
                  `[tanstack-start] invalidating ${file} after a route change failed: ${String(error)}`,
                )
              })
            }
          },
        )
      }
    },
    configureServer(viteServer) {
      state.server = viteServer
      const s = state.requireSession()
      const environment = viteServer.environments[env.name]
      if (s.start.ip && environment) {
        const ipEnv = s.start.ip.env(env.name, env.type)
        const entries = state.entriesOf(s)
        ipEnv.graph = viteDevGraphView(environment.moduleGraph, (id) =>
          entries.has(id),
        )
        const reporter = ipEnv.useDevReporter({
          warn: (message) => environment.logger.warn(message),
        })
        viteServer.httpServer?.once('close', () => reporter.close())
      }
      viteServer.httpServer?.once('close', () => {
        state.unsubscribeRoutes?.()
        state.unsubscribeRoutes = null
      })
    },
    async buildStart() {
      const s = state.requireSession()
      if (this.environment.mode === 'build' && this.meta.watchMode) {
        s.start.ip?.env(env.name, env.type).beginBuild()
      }
      if (this.environment.mode === 'build' && env.type === 'client') {
        if (!this.meta.watchMode) {
          // a new build: the registry of the previous one is gone (the
          // client builds first; under RSC the rsc provider built before
          // it and allocated its entries first: deterministic, not
          // client-first). A rebuild of `build --watch` keeps it: the
          // server environment rebuilds at the same time and reads it,
          // while the compiles replace their modules' functions (a
          // deleted file's leave at `watchChange`)
          s.start.registry.clear()
        }
        // one warning per file per run
        s.start.warnings.reset()
      }
      if (
        this.environment.mode === 'build' &&
        this.environment.config.build.write !== false &&
        state.isSeparateProvider(env)
      ) {
        await compileHandlerReach(
          s,
          env,
          state.hostFor(s, this.environment, (source, imp, options) =>
            this.resolve(source, imp, options),
          ),
        )
      }
      const environment = this.environment
      state.virtualLoaders.set(env.name, async (id) => {
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
    buildEnd() {
      if (this.environment.mode === 'build' && env.type === 'client') {
        state.clientBuilt = true
      }
      if (
        this.environment.mode === 'build' &&
        env.type === 'client' &&
        this.meta.watchMode
      ) {
        // a rebuild keeps the registry (a new build cleared it): the
        // functions the client references are those of the modules this
        // build bundles (the server's resolver gates on them)
        const graph = new Set<string>()
        const files = new Set<string>()
        for (const id of this.getModuleIds()) {
          const identity = identify(id)
          graph.add(identity.canonicalId)
          if (
            path.isAbsolute(identity.path) &&
            !NODE_MODULES_RE.test(identity.path)
          ) {
            files.add(identity.path)
          }
        }
        state.requireSession().start.registry.retain(env.name, graph)
        state.clientFiles = [...files]
        state.clientRebuild?.end()
        state.clientRebuild = null
      }
    },
    /**
     * A build that writes its bundle (not a scan: plugin-rsc analyses the
     * rsc and ssr environments with `write: false` first and builds them
     * again) outside watch mode is the environment's last: its compiler
     * state is released before the next environment builds. What later
     * environments read stays in the session: the server-fn registry and id
     * allocator, the raw facts, the warnings ledger.
     */
    closeBundle() {
      if (this.environment.mode === 'build') {
        state.unsubscribeRoutes?.()
        state.unsubscribeRoutes = null
        if (isFinalBuild(this.environment.config.build)) {
          state.requireSession().start.release(env.name)
        }
      }
    },
    resolveId: {
      filter: { id: [SAME_FILE_SPECIFIER_RE, IP_SPECIFIER_RE] },
      handler(source, importer) {
        const edge = resolveViteEdgeModuleId(source)
        if (edge !== null) {
          // an importer's request for an edge module comes from its
          // transformed code (import analysis, or Rolldown): the import
          // survived the TypeScript transform, and `allowImport` decides
          // before the module loads; a pending violation it does not allow
          // is reported, and `error` fails the importer's import analysis
          const ipEnv =
            importer !== undefined && state.session?.start.ip
              ? state.session.start.ip.env(env.name, env.type)
              : null
          const confirmation = ipEnv?.confirm(edge) ?? null
          if (confirmation === null) {
            return edge
          }
          return confirmation.then((error) => {
            if (error) {
              throw error
            }
            // an allowed import of a pre-bundled dependency gets its bundle,
            // as its other importers do (a re-export of its source entry
            // would load a second copy, without Vite's CommonJS interop)
            const target = ipEnv!.allowedTarget(edge)
            const served =
              target === null
                ? target
                : optimizedDependency(this.environment, target)
            return served !== null && served !== target ? served : edge
          })
        }
        return resolveSameFileSpecifier(source, importer)
      },
    },
    load: {
      filter: {
        id: [IP_SPECIFIER_RE, OWNED_QUERY_RE, ASSET_QUERY_RE, ASSET_FILE_RE],
      },
      async handler(id) {
        const s = state.requireSession()
        if (IP_SPECIFIER_RE.test(id)) {
          const load = s.start.ip?.load(id)
          return load
            ? { code: load.code, moduleSideEffects: load.moduleSideEffects }
            : null
        }
        if (isAssetId(id) || ASSET_FILE_RE.test(id)) {
          // never compiled (the transform filters exclude it), and an
          // import the compiler does not read may have brought it here:
          // a denied file's text is served as its mock
          const out = await s.start.assetOutput(env, id)
          const mock =
            out &&
            (await state.afterCompile(s, env, id, out, (error) =>
              this.error(error),
            ))
          if (!mock) {
            return null
          }
          this.addWatchFile(identify(id).path)
          // (Vite's JSON plugin parses what a `.json` loads as)
          return { code: id.endsWith('.json') ? '{}' : mock.code }
        }
        return loadDerivedSource(this, id)
      },
    },
    transform: {
      filter: {
        id: {
          include: TRANSFORM_ID_REGEX,
          exclude: state.ownExclude,
        },
      },
      handler: compileTransform,
    },
    async hotUpdate(ctx) {
      const s = state.requireSession()
      // the file's path once, as every module id and compiler key holds it
      const change: InvalidateChange = {
        path: normalizePath(ctx.file),
        kind: changeKindOf(ctx.type),
      }
      let pending = state.invalidations.get(ctx.read)
      if (!pending) {
        pending = invalidate(
          s.start.caches,
          change,
          invalidationHosts(state, s, state.server, this.environment),
        )
        state.invalidations.set(ctx.read, pending)
      }
      const res = await pending
      if (change.kind === 'unlink') {
        forgetFile(state, s, change.path)
      }
      const extra = applyInvalidation(
        state,
        this.environment,
        change,
        res,
        ctx.timestamp,
      )
      const changed = await changedDependents(
        state,
        this.environment as DevEnvironment,
        extra,
      )
      // see router-plugin's Vite host: the file's modules its current plan produces
      const live =
        (await liveModules(
          this.environment as DevEnvironment,
          s.start.caches,
          change.path,
          ctx.modules,
        )) ?? ctx.modules
      return changed.length > 0 || live !== ctx.modules
        ? [...live, ...changed]
        : undefined
    },
    // The one invalidation of a file event. Bundled dev: applied to every
    // environment's module graph (Vite's `hotUpdate` is not called there;
    // the watching environment's hook applies it). `build --watch`: each
    // environment's watcher reports the files it bundles, and the rebuild
    // compiles their dependents again, against the caches the
    // invalidation left
    async watchChange(id, event) {
      const s = state.requireSession()
      const environment = this.environment
      if (environment.mode === 'dev' && !(watches && s.bundledDev)) {
        return
      }
      if (environment.mode === 'build' && env.type === 'client') {
        if (!state.clientRebuild) {
          let end!: () => void
          const ended = new Promise<void>((resolve) => (end = resolve))
          state.clientRebuild = { ended, end }
        }
      }
      // the file's path once, as every module id and compiler key holds it
      // (Rolldown reports its watcher's native path: backslashes on Windows)
      const change: InvalidateChange = {
        path: normalizePath(id),
        kind: changeKindOf(event.event),
      }
      if (change.kind === 'unlink') {
        forgetFile(state, s, change.path)
      }
      if (environment.mode !== 'dev') {
        await invalidate(
          s.start.caches,
          change,
          state.hostFor(s, environment, (source, importer, options) =>
            this.resolve(source, importer, options),
          ),
        )
        return
      }
      const res = await invalidate(
        s.start.caches,
        change,
        invalidationHosts(state, s, state.server, environment),
      )
      const now = Date.now()
      const environments = state.server
        ? Object.values(state.server.environments).filter((e) =>
            state.envNames.has(e.name),
          )
        : [environment]
      for (const environment of environments) {
        applyInvalidation(state, environment, change, res, now)
      }
    },
    renderChunk(code, chunk) {
      const s = state.requireSession()
      if (!s.start.allocator || !code.includes('__TSS_FN_ID_')) {
        return null
      }
      const { allocator, errors, warnings } = s.start.allocateIds(env.type)
      if (errors.length > 0) {
        this.error({ message: errors.join('\n') })
      }
      for (const warning of warnings) {
        this.warn(warning)
      }
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
    /**
     * Import protection's build reports: the edge modules that survived
     * tree-shaking → `onViolation` once per import → the build's errors and
     * warnings.
     */
    async generateBundle(_options, bundle) {
      const s = state.requireSession()
      if (this.environment.mode !== 'build') {
        return
      }
      if (env.type === 'client') {
        // an extracted-export output an entry chunk (or a chunk it imports
        // statically) holds is eager whatever the splitter did: say so
        // once per file and export (J2.8)
        warnEagerExports(
          rollupEntryModuleIds(bundle as never),
          'rollup',
          s.start.warnings,
          (m) => this.warn(m),
          (id) => this.getModuleInfo(id)?.importers ?? [],
          {
            root: s.start.opts.root,
            routeTree:
              state.opts.getConfig().startConfig.router.generatedRouteTree,
          },
        )
      }
      if (!s.start.ip) {
        return
      }
      const ipEnv = s.start.ip.env(env.name, env.type)
      const live = readRolldownWitness(bundle as never, ipEnv.witness())
      const reports = await ipEnv.surviving(
        live,
        rolldownGraphView((id) => this.getModuleInfo(id)),
      )
      // every report first: the build fails once, with all of its errors
      const errors: Array<string> = []
      for (const report of reports) {
        if (report.severity === 'error') {
          errors.push(report.message)
        } else {
          this.warn(report.message)
        }
      }
      if (errors.length > 0) {
        this.error(errors.join('\n'))
      }
    },
  }
  return [
    plugin,
    {
      // dependency scripts: only those whose text names what the compiler
      // recognises reach the compiler (most of a dependency graph never
      // crosses into JavaScript)
      name: `tanstack-start:compiler:${env.name}:dependencies`,
      enforce: 'pre',
      applyToEnvironment(e) {
        return e.name === env.name
      },
      transform: { filter: state.dependencyFilter, handler: compileTransform },
    },
  ]
}
