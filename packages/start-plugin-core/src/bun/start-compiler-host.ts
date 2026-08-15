import { readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'pathe'
import {
  createStartCompiler,
  mergeServerFnsById,
  matchesCodeFilters,
} from '../start-compiler/host'
import { detectKindsInCode } from '../start-compiler/compiler'
import { getTransformCodeFilterForEnv } from '../start-compiler/config'
import { TRANSFORM_ID_REGEX } from '../constants'
import type { StartCompiler } from '../start-compiler/compiler'
import type { ServerFn } from '../start-compiler/types'
import type { CompileStartFrameworkOptions } from '../types'
import type { BunPlugin } from 'bun'

export interface BunCompilerHostOptions {
  root: string
  framework: CompileStartFrameworkOptions
  providerEnvName: string
  mode: 'dev' | 'build'
  ssrIsProvider: boolean
  serverFnsById: Record<string, ServerFn>
  /** Called after registry mutations so virtual modules can refresh */
  onRegistryChange?: () => void
  /**
   * Optional preprocess (e.g. route code-splitter reference transform).
   * Runs before StartCompiler so both share a single Bun onLoad.
   */
  preprocessCode?: (
    code: string,
    id: string,
    env: 'client' | 'server',
  ) => string | Promise<string>
}

export interface BunCompilerHosts {
  client: StartCompiler
  server: StartCompiler
  createTransformPlugin: (env: 'client' | 'server') => BunPlugin
  invalidate: (ids: Iterable<string>) => void
}

function shouldTransformId(id: string): boolean {
  if (id.includes('node_modules')) return false
  return TRANSFORM_ID_REGEX.some((re) => re.test(id))
}

export function createBunCompilerHosts(
  opts: BunCompilerHostOptions,
): BunCompilerHosts {
  const sharedResolve = async (id: string, importer?: string) => {
    try {
      const resolved = await Bun.resolve(id, importer ?? opts.root)
      return resolved
    } catch {
      try {
        return resolvePath(importer ? resolvePath(importer, '..') : opts.root, id)
      } catch {
        return null
      }
    }
  }

  const makeCompiler = (env: 'client' | 'server', envName: string) => {
    // loadModule must ingest into the same compiler instance (Vite does this too).
    let compiler!: StartCompiler
    compiler = createStartCompiler({
      env,
      envName,
      root: opts.root,
      framework: opts.framework,
      providerEnvName: opts.providerEnvName,
      mode: opts.mode,
      getKnownServerFns: () => opts.serverFnsById,
      onServerFnsById: (discovered) => {
        mergeServerFnsById(opts.serverFnsById, discovered)
        opts.onRegistryChange?.()
      },
      loadModule: async (id: string) => {
        const filePath = id.includes('?') ? id.slice(0, id.indexOf('?')) : id
        try {
          const code = await readFile(filePath, 'utf8')
          compiler.ingestModule({ code, id })
        } catch {
          // ignore missing during graph crawl
        }
      },
      resolveId: sharedResolve,
      encodeModuleSpecifierInDev:
        opts.mode === 'dev'
          ? ({ extractedFilename }) =>
              Buffer.from(extractedFilename, 'utf8').toString('base64url')
          : undefined,
    })
    return compiler
  }

  const client = makeCompiler('client', 'client')
  const server = makeCompiler('server', 'ssr')

  const createTransformPlugin = (env: 'client' | 'server'): BunPlugin => {
    const compiler = env === 'client' ? client : server
    const codeFilter = getTransformCodeFilterForEnv(env)

    return {
      name: `tanstack-start-compiler:${env}`,
      setup(build) {
        // Provider split modules: absolute/file?tss-serverfn-split
        // Bun may not invoke plugins for absolute paths unless the filter matches.
        const resolveServerFnSplit = (args: { path: string }) => {
          if (!args.path.includes('tss-serverfn-split')) {
            return undefined
          }
          const q = args.path.indexOf('?')
          const filePath = q >= 0 ? args.path.slice(0, q) : args.path
          return {
            path: `${filePath}?tss-serverfn-split`,
            namespace: 'tanstack-serverfn',
          }
        }

        build.onResolve(
          { filter: /tss-serverfn-split/ },
          resolveServerFnSplit,
        )
        build.onResolve(
          { filter: /^\// },
          (args) =>
            args.path.includes('tss-serverfn-split')
              ? resolveServerFnSplit(args)
              : undefined,
        )

        build.onLoad(
          { filter: /.*/, namespace: 'tanstack-serverfn' },
          async (args) => {
            const filePath = args.path.includes('?')
              ? args.path.slice(0, args.path.indexOf('?'))
              : args.path
            const code = await readFile(filePath, 'utf8')
            const detectedKinds = detectKindsInCode(code, env)
            const result = await compiler.compile({
              code,
              id: args.path,
              detectedKinds,
            })
            if (!result) {
              return { contents: code, loader: filePath.endsWith('x') ? 'tsx' : 'ts' }
            }
            return {
              contents: result.code,
              loader: filePath.endsWith('x') ? 'tsx' : 'ts',
            }
          },
        )

        build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
          if (args.namespace === 'tanstack-serverfn') {
            return undefined
          }
          if (!shouldTransformId(args.path)) {
            return undefined
          }

          let code = await readFile(args.path, 'utf8')
          const originalCode = code
          if (opts.preprocessCode) {
            code = await opts.preprocessCode(code, args.path, env)
          }
          const preprocessed = code !== originalCode

          const needsStartCompile =
            matchesCodeFilters(code, codeFilter) &&
            detectKindsInCode(code, env).size > 0

          if (!needsStartCompile) {
            if (preprocessed) {
              return {
                contents: code,
                loader: args.path.endsWith('x') ? 'tsx' : 'ts',
              }
            }
            return undefined
          }

          const detectedKinds = detectKindsInCode(code, env)
          const result = await compiler.compile({
            code,
            id: args.path,
            detectedKinds,
          })

          if (!result) {
            if (preprocessed) {
              return {
                contents: code,
                loader: args.path.endsWith('x') ? 'tsx' : 'ts',
              }
            }
            return undefined
          }

          return {
            contents: result.code,
            loader: args.path.endsWith('x') ? 'tsx' : 'ts',
          }
        })
      },
    }
  }

  return {
    client,
    server,
    createTransformPlugin,
    invalidate(ids) {
      client.invalidateModules(ids)
      server.invalidateModules(ids)
      for (const id of ids) {
        for (const [fnId, fn] of Object.entries(opts.serverFnsById)) {
          if (fn.filename === id || fn.extractedFilename.startsWith(id)) {
            delete opts.serverFnsById[fnId]
          }
        }
      }
      opts.onRegistryChange?.()
    },
  }
}
