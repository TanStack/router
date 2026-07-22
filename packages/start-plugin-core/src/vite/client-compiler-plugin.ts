import { START_ENVIRONMENT_NAMES } from '../constants'
import { startCompilerPlugin } from './start-compiler-plugin/plugin'
import type { GenerateFunctionIdFnOptional } from '../start-compiler/types'
import type {
  CompileStartFrameworkOptions,
  StartCompilerImportTransform,
} from '../types'
import type { PluginOption } from 'vite'

export interface StartClientCompilerViteOptions {
  framework: CompileStartFrameworkOptions
  /** Absolute URL of the deployed Start server-function endpoint. */
  serverFnBase: string
  /** ID format expected by the target Start server. */
  serverFnMode?: 'dev' | 'build'
  environmentName?: string
  generateFunctionId?: GenerateFunctionIdFnOptional
  compilerTransforms?: Array<StartCompilerImportTransform>
}

export function normalizeServerFnBase(serverFnBase: string): string {
  let url: URL
  try {
    url = new URL(serverFnBase)
  } catch {
    throw new Error(
      `serverFnBase must be an absolute URL, received ${JSON.stringify(serverFnBase)}.`,
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `serverFnBase must use http or https, received ${JSON.stringify(url.protocol)}.`,
    )
  }
  if (url.search || url.hash) {
    throw new Error('serverFnBase cannot contain a query string or hash.')
  }

  if (!url.pathname.endsWith('/')) {
    url.pathname += '/'
  }

  return url.toString()
}

/**
 * Compile a standalone Vite client against a separately deployed Start server.
 * This is used by native clients, which do not build an SSR/provider environment.
 */
export function startClientCompilerVite(
  options: StartClientCompilerViteOptions,
): Array<PluginOption> {
  const environmentName =
    options.environmentName ?? START_ENVIRONMENT_NAMES.client
  const serverFnBase = normalizeServerFnBase(options.serverFnBase)

  return [
    {
      name: 'tanstack-start-core:standalone-client-config',
      config() {
        return {
          define: {
            'process.env.TSS_SERVER_FN_BASE': JSON.stringify(serverFnBase),
            'import.meta.env.TSS_SERVER_FN_BASE': JSON.stringify(serverFnBase),
          },
        }
      },
    },
    startCompilerPlugin({
      framework: options.framework,
      environments: [{ name: environmentName, type: 'client' }],
      generateFunctionId: options.generateFunctionId,
      compilerTransforms: options.compilerTransforms,
      providerEnvName: START_ENVIRONMENT_NAMES.server,
      compilerMode: options.serverFnMode,
    }),
  ]
}
