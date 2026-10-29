/**
 * The Rspack plugin of one Start environment compiler: installs the loader
 * implementation on the compiler, the generator as a precondition of the
 * compilation (`beforeRun`/`watchRun`), the one invalidation operation on
 * `watchRun`, the `finishMake` replay of server-fn and import-protection
 * `buildInfo` (persistent cache), the import-protection build verdict
 * (`processAssets` witness, `decide`,
 * `needAdditionalPass` to the fixed point) and dev reports (`finishModules`),
 * the custom server-fn id patching, and the client route tree rebuild when
 * its pruned routes change without the tree file changing.
 */
import {
  eagerExportWarning,
  eagerExtractedExports,
  initialChunkResources,
  invalidateFiles,
  rebuildModules,
} from '@tanstack/router-utils/compiler'
import { RSPACK_BUILD_INFO_KEY } from '../import-protection/verdict'
import {
  readRspackWitness,
  rspackGraphView,
} from '../import-protection/witness'
import { normalizePath } from '../utils'
import {
  SERVER_FN_BUILD_INFO_FIELD,
  canonicalResource,
} from './compiler-session'
import { LOADER_REGISTRY } from './loader-registry'
import type { LoaderImpl } from './compiler-loader'
import type {
  ServerFnBuildInfo,
  StartRsbuildCompilerSession,
  StartRsbuildEnvironment,
} from './compiler-session'
import type { RsbuildRouteGenerator } from './router-generator'
import type { ImportGraphView } from '../import-protection/graph-trace'
import type { Rspack, rspack as rspackNamespaceType } from '@rsbuild/core'

type RspackNamespace = typeof rspackNamespaceType

export interface StartHostPluginOptions {
  session: StartRsbuildCompilerSession
  environment: StartRsbuildEnvironment
  rspack: RspackNamespace
  /** Writes a virtual module file of this environment (import-protection edge modules). */
  writeVirtualModule: (file: string, content: string) => void
  generator: RsbuildRouteGenerator
  /** The client route tree module (client environment only): rebuilt when its pruned routes change. */
  clientRouteTree?: { path: () => string; version: () => number }
  /** After the `finishMake` replay rebuilt the registry (the resolver virtual module is rewritten). */
  onServerFnsReplayed: () => void
}

const PLUGIN_NAME = 'tanstack-start:compiler'

/** The compilation's graph view; a compilation Rspack dropped (a stale read after a rebuild) answers nothing. */
function guardedGraphView(compilation: Rspack.Compilation): ImportGraphView {
  const view = rspackGraphView(compilation as never)
  return {
    importers(id) {
      try {
        return view.importers(id)
      } catch {
        return []
      }
    },
    isEntry(id) {
      try {
        return view.isEntry(id)
      } catch {
        return false
      }
    },
  }
}

interface ModuleLike {
  resource?: string
  buildInfo?: Record<string, unknown>
  identifier: () => string
}

export function createStartHostPlugin(opts: StartHostPluginOptions): {
  apply: (compiler: Rspack.Compiler) => void
} {
  const { session, environment, rspack } = opts
  const env = session.env(environment.name)
  /**
   * This environment's import protection, looked up when a hook runs (not
   * held by the hooks): the session releases it once the environment's
   * build is finished.
   */
  const ipEnvOf = () =>
    session.ip?.env(environment.name, environment.type) ?? null
  return {
    apply(compiler) {
      const { Compilation, WebpackError } = rspack
      ;(compiler as unknown as Record<string, unknown>)[LOADER_REGISTRY] = ((
        ctx,
        source,
        inputMap,
        options,
      ) => session.compile(ctx, source, inputMap, options)) satisfies LoaderImpl

      // the session reads files through the compiler's input file system (virtual modules included)
      const inputFs = compiler.inputFileSystem
      if (inputFs) {
        session.inputFileSystems.set(
          environment.name,
          (file) =>
            new Promise((resolve) => {
              try {
                inputFs.readFile(file, (error, data) => {
                  resolve(
                    error || data == null
                      ? null
                      : Buffer.isBuffer(data)
                        ? data.toString('utf8')
                        : String(data),
                  )
                })
              } catch {
                resolve(null)
              }
            }),
        )
      }
      try {
        const resolver = compiler.resolverFactory.get('normal', {
          dependencyType: 'esm',
        })
        session.resolvers.set(
          environment.name,
          (dir, request) =>
            new Promise((resolve) => {
              try {
                resolver.resolve({}, dir, request, {}, (error, result) => {
                  resolve(
                    !error && typeof result === 'string'
                      ? normalizePath(result)
                      : null,
                  )
                })
              } catch {
                resolve(null)
              }
            }),
        )
      } catch {
        // no resolver outside loaders: the invalidation re-resolves nothing
      }

      // import-protection edge modules are virtual files of this environment, written when
      // they are defined (the importer's compile) or change state (a build veto); an importer
      // restored from the persistent cache in a new process requests a module nothing
      // defined: the request carries its content, which defines it before it resolves
      if (session.ip) {
        const ip = session.ip
        ip.onEdgeModule((file, load, ref) => {
          if (ref.env === environment.name) {
            opts.writeVirtualModule(file, load.code)
          }
        })
        compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (factory) => {
          factory.hooks.beforeResolve.tap(PLUGIN_NAME, (data) => {
            ip.define(data.request)
          })
        })
      }

      /** The files of the last compilation (a modified file outside them is a created one: an `add`, which re-resolves
       * imports that failed to resolve before). */
      let knownFiles: ReadonlySet<string> | null = null
      let currentCompilation: Rspack.Compilation | null = null
      let reporterInstalled = false
      let clientTreeBuiltAt = -1

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
        // one warning per file per run (J2.19): the session's ledger is
        // shared by every environment's compiler; the client's run starts it
        if (environment.type === 'client') {
          session.warnings.reset()
        }
        ipEnvOf()?.beginLogicalBuild()
        await opts.generator.beforeRun()
      })

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async (c) => {
        const modified = [...(c.modifiedFiles ?? [])]
        const removed = [...(c.removedFiles ?? [])]
        ipEnvOf()?.beginLogicalBuild()
        // Rspack reports no event for a file created while nothing depended on it (a target
        // deleted and recreated between edits): failed resolutions and missing-file facts are
        // re-read by the compiles of this compilation
        session.forgetMisses()
        await session.invalidateFileEvents(
          modified,
          removed,
          (file) => !knownFiles || knownFiles.has(file),
        )
        await opts.generator.watchRun(modified, removed)
      })
      // a registry change (the generator published new route ids): Rspack sees
      // no file event for the files concerned, so it is told they changed and
      // builds them again. Before the first compilation finished nothing is
      // stale (the first publication lists every route; the modules are
      // built with it).
      opts.generator.onRoutesChanged((files) => {
        void session.registryChanged(files).then((paths) => {
          if (session.compiledOnce) {
            invalidateFiles(compiler, paths)
          }
        })
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void opts.generator.close()
      })

      compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
        session.compiledOnce = true
        const deps = stats.compilation.fileDependencies
        knownFiles = new Set<string>(deps as Iterable<string>)
        if (session.opts.mode === 'dev') {
          session.retain(environment.name, knownFiles)
        } else if (
          !compiler.watchMode &&
          !stats.compilation.needAdditionalPass
        ) {
          // the last pass of a production build (an import-protection veto
          // asks for another one, and `done` runs after each pass): nothing
          // compiles in this environment any more
          session.release(environment.name)
        }
      })

      /** The entry modules' resources of a compilation. */
      compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
        currentCompilation = compilation
        env.compiled.clear()
        if (session.opts.mode === 'build' && environment.type === 'client') {
          // an extracted-export output an initial chunk holds is eager
          // whatever the splitter did: say so once per file and export (J2.8)
          compilation.hooks.processAssets.tap(PLUGIN_NAME, () => {
            const ids = initialChunkResources(compilation as never).map(
              canonicalResource,
            )
            for (const e of eagerExtractedExports(ids)) {
              const message = eagerExportWarning(e, 'webpack')
              if (
                session.warnings.once(e.file, {
                  severity: 'warning',
                  message,
                  code: `eager-export\u0000${e.name}`,
                })
              ) {
                compilation.warnings.push(new WebpackError(message))
              }
            }
          })
        }
        const ipEnv = ipEnvOf()
        if (ipEnv) {
          // Rspack's module graph is not readable while modules build (a loader asking for a
          // trace would abort the process): no graph until `finishModules`, when the
          // compilation's complete graph replaces it (traces built before use the edge index)
          ipEnv.graph = null
          if (session.opts.mode === 'dev') {
            if (!reporterInstalled) {
              reporterInstalled = true
              // no timers: `finishModules` is the completion event
              ipEnv.useDevReporter(
                {
                  warn: (message) => {
                    currentCompilation?.warnings.push(new WebpackError(message))
                  },
                },
                undefined,
                { setTimer: () => null, clearTimer: () => {} },
              )
            }
            compilation.hooks.finishModules.tapPromise(
              PLUGIN_NAME,
              async (modules) => {
                ipEnv.graph = guardedGraphView(compilation)
                if (session.ip!.config.log === 'always') {
                  // modules this compilation kept without compiling them report again: an
                  // importer its violations, an edge module the pending ones it witnesses
                  for (const m of modules) {
                    const module = m as unknown as ModuleLike
                    if (!module.resource || env.compiled.has(module.resource)) {
                      continue
                    }
                    const record = module.buildInfo?.[RSPACK_BUILD_INFO_KEY]
                    if (record) {
                      await ipEnv.reportAgain(
                        canonicalResource(module.resource),
                        record,
                      )
                    } else {
                      await ipEnv.confirm(module.resource)
                    }
                  }
                }
                ipEnv.reporter?.flush(true)
              },
            )
          } else {
            compilation.hooks.processAssets.tapPromise(
              {
                name: PLUGIN_NAME,
                stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
              },
              async () => {
                const buildEnv = ipEnvOf()!
                const live = readRspackWitness(
                  compilation as never,
                  buildEnv.witness(),
                )
                const result = await buildEnv.decide(
                  live,
                  guardedGraphView(compilation),
                )
                if (result.needPass) {
                  return
                }
                for (const report of buildEnv.buildReports()) {
                  ;(report.severity === 'error'
                    ? compilation.errors
                    : compilation.warnings
                  ).push(new WebpackError(report.message))
                }
              },
            )
            // a bail hook stops at the first tap answering anything but
            // `undefined`: `false` would silence later taps asking for a pass
            // (Rspack types the answer `boolean`; `undefined` is "no vote")
            compilation.hooks.needAdditionalPass.tap(
              PLUGIN_NAME,
              () =>
                (ipEnvOf()!.build.needPass || undefined) as unknown as boolean,
            )
          }
        }
        if (session.allocator && session.opts.mode === 'build') {
          compilation.hooks.processAssets.tap(
            {
              name: PLUGIN_NAME,
              stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
            },
            () => patchFunctionIds(compilation),
          )
        }
      })

      /** Custom server-fn ids: this environment's rank, patched before minification. */
      function patchFunctionIds(compilation: Rspack.Compilation): void {
        const allocator = session.allocateIds(environment.type)
        if (!allocator) {
          return
        }
        for (const asset of compilation.getAssets()) {
          if (!/\.[cm]?js$/.test(asset.name)) {
            continue
          }
          const code = asset.source.source().toString()
          if (!code.includes('__TSS_FN_ID_')) {
            continue
          }
          const patched = allocator.patch(code)
          if (patched.missing.length > 0) {
            compilation.errors.push(
              new WebpackError(
                `Server function ids could not be resolved in ${asset.name}: ${patched.missing.join(', ')}`,
              ),
            )
          }
          const source = new rspack.sources.ReplaceSource(asset.source)
          for (const edit of patched.edits) {
            source.replace(edit.start, edit.end - 1, edit.text)
          }
          compilation.updateAsset(asset.name, source)
        }
      }

      // the client route tree without its server-only routes: served by the host's transform
      // of the tree module; when its routes change without the file, the module is rebuilt
      if (opts.clientRouteTree && environment.type === 'client') {
        const tree = opts.clientRouteTree
        compiler.hooks.finishMake.tapPromise(
          { name: `${PLUGIN_NAME}:route-tree`, stage: -30 },
          async (compilation) => {
            if (compilation.compiler !== compiler) {
              return
            }
            const version = tree.version()
            if (version === clientTreeBuiltAt) {
              return
            }
            await rebuildModules(
              compilation,
              new Set([normalizePath(tree.path())]),
              canonicalResource,
            )
            clientTreeBuiltAt = version
          },
        )
      }

      // the replay of this compilation's modules (built now or restored from the persistent
      // cache): the environment's server-fn snapshot and the import-protection records. In dev,
      // a module restored with violations, or an edge module restored with pending ones, was
      // judged by another session (its `onViolation` verdicts decided its output; its reports
      // were printed there): built again first
      compiler.hooks.finishMake.tapPromise(
        { name: `${PLUGIN_NAME}:replay`, stage: -20 },
        async (compilation) => {
          if (compilation.compiler !== compiler) {
            return
          }
          const ipEnv = ipEnvOf()
          if (ipEnv && session.opts.mode === 'dev') {
            const unjudged = new Set<string>()
            for (const m of compilation.modules) {
              const module = m as unknown as ModuleLike
              const ip = module.buildInfo?.[RSPACK_BUILD_INFO_KEY]
              if (
                ip &&
                module.resource &&
                !env.compiled.has(module.resource) &&
                ipEnv.unjudged(canonicalResource(module.resource), ip)
              ) {
                unjudged.add(module.resource)
              }
            }
            if (unjudged.size > 0) {
              await rebuildModules(compilation, unjudged, (r) => r)
            }
            // an edge module restored without a build: the pending violations it witnesses
            // are decided when this session builds it (the edge-module loader)
            const unconfirmed = new Set<string>()
            for (const m of compilation.modules) {
              const resource = (m as unknown as ModuleLike).resource
              if (resource && ipEnv.unconfirmed(resource)) {
                unconfirmed.add(resource)
              }
            }
            if (unconfirmed.size > 0) {
              await rebuildModules(compilation, unconfirmed, (r) => r)
            }
          }
          const snapshot = new Map<string, ServerFnBuildInfo>()
          for (const m of compilation.modules) {
            const module = m as unknown as ModuleLike
            const info = module.buildInfo
            if (!info) {
              continue
            }
            const fns = info[SERVER_FN_BUILD_INFO_FIELD] as
              | ServerFnBuildInfo
              | undefined
            if (fns?.version === 2) {
              snapshot.set(module.resource ?? module.identifier(), fns)
            }
            const ip = info[RSPACK_BUILD_INFO_KEY]
            if (ipEnv && ip && module.resource) {
              ipEnv.replay(canonicalResource(module.resource), ip)
            }
          }
          env.serverFns = snapshot
          session.rebuildRegistry()
          opts.onServerFnsReplayed()
        },
      )
    },
  }
}
