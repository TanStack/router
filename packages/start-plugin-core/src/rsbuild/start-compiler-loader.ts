import remapping from '@jridgewell/remapping'
import { detectKindsInCode } from '../start-compiler/compiler'
import {
  loadCompilerVirtualModule,
  matchesCodeFilters,
} from '../start-compiler/host'
import { SERVER_FN_BUILD_INFO_FIELD } from './start-compiler-metadata'
import type { SourceMapInput } from '@jridgewell/remapping'
import type { Rspack } from '@rsbuild/core'
import type { StartCompiler } from '../start-compiler/compiler'
import type { ServerFn } from '../start-compiler/types'
import type {
  StartCompilerImportTransform,
  StartCompilerPlugin,
  StartCompilerTransformResult,
} from '../types'
import type { ServerFnBuildInfo } from './start-compiler-metadata'

export interface StartCompilerLoaderOptions {
  env: 'client' | 'server'
  envName: string
  getRoot: () => string
  compilerPlugins: Array<StartCompilerPlugin>
  compilerTransforms?: Array<StartCompilerImportTransform>
  codeFilters: ReadonlyArray<RegExp>
  compile: (
    context: Rspack.LoaderContext,
    input: Parameters<StartCompiler['compile']>[0],
  ) => Promise<{
    result: Awaited<ReturnType<StartCompiler['compile']>>
    serverFnsById: Record<string, ServerFn>
  }>
}

const EMPTY_SERVER_FN_BUILD_INFO: ServerFnBuildInfo = {
  version: 1,
  serverFnsById: {},
}

const tanStackStartCompilerLoader: Rspack.LoaderDefinition<StartCompilerLoaderOptions> =
  async function (source, map): Promise<void> {
    const callback = this.async()

    try {
      const options = this.getOptions()
      const id = this.resource
      const virtualResult = loadCompilerVirtualModule(options.compilerPlugins, {
        code: source,
        id,
        root: options.getRoot(),
        env: options.env,
        envName: options.envName,
      })
      let result: StartCompilerTransformResult = virtualResult ?? {
        code: source,
      }
      let serverFnsById: Record<string, ServerFn> | null = null

      // Filter virtual output, which can introduce new Start compiler patterns.
      if (matchesCodeFilters(result.code, options.codeFilters)) {
        const compiled = await options.compile(this, {
          id,
          code: result.code,
          detectedKinds: detectKindsInCode(result.code, options.env, options),
          warn: (message) => this.emitWarning(new Error(message)),
        })
        result = compiled.result ?? result
        serverFnsById = compiled.serverFnsById
      }

      // Filtering out a module must also clear metadata from an earlier build.
      const buildInfo = this._module.buildInfo
      if (serverFnsById !== null) {
        buildInfo[SERVER_FN_BUILD_INFO_FIELD] = {
          version: 1,
          serverFnsById,
        } satisfies ServerFnBuildInfo
      } else if (buildInfo[SERVER_FN_BUILD_INFO_FIELD]) {
        buildInfo[SERVER_FN_BUILD_INFO_FIELD] = EMPTY_SERVER_FN_BUILD_INFO
      }
      const mergedMap =
        map && result.map
          ? remapping(
              [result.map as SourceMapInput, map as SourceMapInput],
              () => null,
            )
          : (result.map ?? map)
      callback(null, result.code, mergedMap as typeof map)
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)))
    }
  }

export default tanStackStartCompilerLoader
