import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { detectKindsInCode } from '../start-compiler/compiler'
import { getTransformCodeFilterForEnv } from '../start-compiler/config'
import {
  createStartCompiler,
  matchesCodeFilters,
} from '../start-compiler/host'
import { cleanId } from '../start-compiler/utils'
import type { StartCompiler } from '../start-compiler/compiler'
import type {
  CompileStartFrameworkOptions,
  StartCompilerImportTransform,
} from '../types'
import type {
  GenerateFunctionIdFnOptional,
  ServerFn,
} from '../start-compiler/types'

const METRO_ENV_NAME = 'metro-client'

export interface CreateMetroCompilerOptions {
  framework: CompileStartFrameworkOptions
  /**
   * Project root. Must match the root used by the deployed Start server build
   * for `generateFunctionId` to produce matching IDs across the two builds.
   */
  root: string
  generateFunctionId?: GenerateFunctionIdFnOptional
  compilerTransforms?: Array<StartCompilerImportTransform>
}

export interface MetroCompileResult {
  code: string
  map?: unknown
}

export interface MetroCompilerHandle {
  /**
   * Compile a source file. Returns null if the file has nothing to transform
   * (does not match any of the start-compiler detection patterns).
   *
   * Throws on parse / compilation errors so the caller can surface them.
   */
  compile: (args: {
    id: string
    code: string
  }) => Promise<MetroCompileResult | null>
  /**
   * Invalidate cached binding/export info for a file. Call from your dev
   * file-watcher when a file changes so the next compile picks up changes.
   */
  invalidate: (id: string) => void
  /**
   * Read-only registry of server functions discovered so far. Empty unless
   * `onServerFn` is provided in options to populate something — Metro builds
   * standalone, so cross-environment sharing is not needed.
   */
  getServerFns: () => Readonly<Record<string, ServerFn>>
}

/**
 * Create a TanStack Start compiler configured for Metro / React Native.
 *
 * Unlike the Vite and Rsbuild adapters, this is **client-only**: Metro bundles
 * the RN client app, while the TanStack Start server is a separate deployment
 * (typically a Vite or Rsbuild Start build). The two builds agree on server
 * function IDs because `generateFunctionId` is deterministic given the same
 * source tree and root.
 *
 * Server function call sites in the bundled client are rewritten to RPC stubs
 * that fetch from the deployed server. The handler bodies are discarded — no
 * provider files are extracted (Metro has no virtual-module/query-string
 * support for that).
 *
 * The slow-path import resolution falls back to `require.resolve`. Direct
 * imports from `@tanstack/<framework>-start` (the recommended pattern) hit the
 * fast path and never invoke the resolver — so the limitation only bites when
 * `createServerFn` is re-exported through user-defined utility modules with
 * non-standard resolution.
 */
export function createMetroCompiler(
  opts: CreateMetroCompilerOptions,
): MetroCompilerHandle {
  let compiler: StartCompiler | undefined
  const serverFnsById: Record<string, ServerFn> = {}

  const codeFilters = getTransformCodeFilterForEnv('client', {
    compilerTransforms: opts.compilerTransforms,
  })

  // Resolver anchored at the project root for bare imports (e.g.
  // `@tanstack/react-start`). For relative imports, we re-create the require
  // anchored at the importer.
  const baseRequire = createRequire(opts.root + '/__tsr_metro_resolver__')

  const ensureCompiler = (): StartCompiler => {
    if (compiler) return compiler

    compiler = createStartCompiler({
      env: 'client',
      envName: METRO_ENV_NAME,
      root: opts.root,
      mode: 'build',
      framework: opts.framework,
      providerEnvName: METRO_ENV_NAME,
      generateFunctionId: opts.generateFunctionId,
      compilerTransforms: opts.compilerTransforms,
      serverFnProviderModuleDirectives: undefined,
      onServerFnsById: (discovered) => {
        for (const [id, fn] of Object.entries(discovered)) {
          serverFnsById[id] = fn
        }
      },
      getKnownServerFns: () => serverFnsById,
      encodeModuleSpecifierInDev: undefined,
      loadModule: async (moduleId: string) => {
        const cleanedId = cleanId(moduleId)
        const code = await fs.readFile(cleanedId, 'utf8')
        compiler!.ingestModule({ code, id: cleanedId })
      },
      resolveId: (source: string, importer?: string) => {
        try {
          const req = importer ? createRequire(importer) : baseRequire
          return Promise.resolve(cleanId(req.resolve(source)))
        } catch {
          return Promise.resolve(null)
        }
      },
    })

    return compiler
  }

  return {
    async compile({ id, code }) {
      if (!matchesCodeFilters(code, codeFilters)) return null
      const c = ensureCompiler()
      const detectedKinds = detectKindsInCode(code, 'client', {
        compilerTransforms: opts.compilerTransforms,
      })
      const result = await c.compile({ id, code, detectedKinds })
      if (!result) return null
      return { code: result.code, map: result.map ?? undefined }
    },
    invalidate(id: string) {
      compiler?.invalidateModule(id)
    },
    getServerFns() {
      return serverFnsById
    },
  }
}
