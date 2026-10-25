/**
 * The Rspack plugin of one Start environment compiler (DESIGN §4.2.3–4.2.5;
 * R30, R33, R47): installs the loader implementation on the compiler, the
 * generator as a precondition of the compilation (`beforeRun`/`watchRun`),
 * the one invalidation operation on `watchRun`, the `finishMake` replay of
 * server-fn and import-protection `buildInfo` (persistent cache), the
 * import-protection build verdict (`processAssets` witness, `decide`,
 * `needAdditionalPass` to the fixed point) and dev reports (`finishModules`),
 * the custom server-fn id patching, and the client route tree rebuild when
 * its pruned routes change without the tree file changing.
 */
import { RSPACK_BUILD_INFO_KEY } from '../import-protection/verdict'
import {
  readRspackWitness,
  rspackGraphView,
} from '../import-protection/witness'
import { normalizePath } from '../utils'
import { SERVER_FN_BUILD_INFO_FIELD } from './compiler-session'
import { LOADER_REGISTRY } from './compiler-loader'
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
  const ipEnv = session.ip?.env(environment.name) ?? null
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
        session.inputFileSystems.set(environment.name, (file) =>
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
        session.resolvers.set(environment.name, (dir, request) =>
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

      // import-protection edge modules are virtual files of this environment
      if (session.ip && ipEnv) {
        session.ip.onEdgeModule((file, load, ref) => {
          if (ref.env === environment.name) {
            opts.writeVirtualModule(file, load.code)
          }
        })
      }

      /** The files of the last compilation (a modified file outside them is a created one: R47 `add`). */
      let knownFiles: ReadonlySet<string> | null = null
      let currentCompilation: Rspack.Compilation | null = null
      let reporterInstalled = false
      let clientTreeBuiltAt = -1

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
        session.warnings.reset()
        ipEnv?.beginLogicalBuild()
        await opts.generator.beforeRun()
      })

      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async (c) => {
        const modified = [...(c.modifiedFiles ?? [])]
        const removed = [...(c.removedFiles ?? [])]
        ipEnv?.beginLogicalBuild()
        // Rspack reports no event for a file created while nothing depended on it (a target
        // deleted and recreated between edits): failed resolutions and missing-file facts are
        // re-read by the compiles of this compilation
        session.forgetMisses()
        for (const file of modified) {
          await session.invalidate(
            file,
            knownFiles && !knownFiles.has(file) ? 'add' : 'change',
          )
        }
        for (const file of removed) {
          await session.invalidate(file, 'unlink')
        }
        await opts.generator.watchRun(modified, removed)
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void opts.generator.close()
      })

      compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
        const deps = stats.compilation.fileDependencies
        knownFiles = new Set<string>(deps as Iterable<string>)
      })

      /** The entry modules' resources of a compilation. */
      const entryResources = (compilation: Rspack.Compilation): Set<string> => {
        const out = new Set<string>()
        for (const entry of compilation.entries.values()) {
          for (const dep of entry.dependencies) {
            const resource = (
              compilation.moduleGraph.getModule(dep) as unknown as
                | ModuleLike
                | null
            )?.resource
            if (resource) {
              out.add(resource)
            }
          }
        }
        return out
      }

      /** The reports of this environment's self-marked entry modules (an entry has no importer to report it). */
      const selfMarkedReports = async (compilation: Rspack.Compilation) => {
        const reports: Array<{ severity: 'error' | 'warning'; message: string }> =
          []
        if (!ipEnv || env.selfMarked.size === 0) {
          return reports
        }
        const entries = entryResources(compilation)
        for (const [resource, marker] of env.selfMarked) {
          if (entries.has(resource)) {
            const report = await ipEnv.selfMarkedReport(
              normalizePath(resource.split('?')[0]!),
              marker,
            )
            if (report) {
              reports.push(report)
            }
          }
        }
        return reports
      }

      compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
        currentCompilation = compilation
        env.compiled.clear()
        if (ipEnv) {
          // the graph of THIS compilation (lazy: read when a trace is built)
          ipEnv.graph = guardedGraphView(compilation)
          // every known edge module exists before the importers' dependencies resolve
          for (const { specifier, load } of ipEnv.edgeModules()) {
            opts.writeVirtualModule(specifier, load.code)
          }
          if (session.opts.mode === 'dev') {
            if (!reporterInstalled) {
              reporterInstalled = true
              // no timers: `finishModules` is the completion event (R21)
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
                if (session.ip!.config.log === 'always') {
                  // modules this compilation kept without compiling them report again
                  for (const m of modules) {
                    const module = m as unknown as ModuleLike
                    const record = module.buildInfo?.[RSPACK_BUILD_INFO_KEY]
                    if (
                      record &&
                      module.resource &&
                      !env.compiled.has(module.resource)
                    ) {
                      await ipEnv.reportAgain(
                        normalizePath(module.resource),
                        record,
                      )
                    }
                  }
                }
                for (const report of await selfMarkedReports(compilation)) {
                  ;(report.severity === 'error'
                    ? compilation.errors
                    : compilation.warnings
                  ).push(new WebpackError(report.message))
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
                const live = readRspackWitness(
                  compilation as never,
                  ipEnv.witness(),
                )
                const result = await ipEnv.decide(
                  live,
                  guardedGraphView(compilation),
                )
                if (result.needPass) {
                  return
                }
                const reports = [
                  ...ipEnv.buildReports(),
                  ...(await selfMarkedReports(compilation)),
                ]
                for (const report of reports) {
                  ;(report.severity === 'error'
                    ? compilation.errors
                    : compilation.warnings
                  ).push(new WebpackError(report.message))
                }
              },
            )
            compilation.hooks.needAdditionalPass.tap(
              PLUGIN_NAME,
              () => ipEnv.build.needPass,
            )
          }
        }
        if (session.allocator && session.opts.mode === 'build') {
          compilation.hooks.processAssets.tap(
            { name: PLUGIN_NAME, stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE },
            () => patchFunctionIds(compilation),
          )
        }
      })

      /** Custom server-fn ids (R40): this environment's rank, patched before minification. */
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
            const treePath = normalizePath(tree.path())
            for (const m of compilation.modules) {
              const resource = (m as unknown as ModuleLike).resource
              if (resource && normalizePath(resource) === treePath) {
                await new Promise<void>((resolve, reject) => {
                  compilation.rebuildModule(m, (error) =>
                    error ? reject(error) : resolve(),
                  )
                })
              }
            }
            clientTreeBuiltAt = version
          },
        )
      }

      // the replay of this compilation's modules (built now or restored from the persistent
      // cache): the environment's server-fn snapshot and the import-protection records
      compiler.hooks.finishMake.tap(
        { name: `${PLUGIN_NAME}:replay`, stage: -20 },
        (compilation) => {
          if (compilation.compiler !== compiler) {
            return
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
              ipEnv.replay(normalizePath(module.resource), ip)
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
