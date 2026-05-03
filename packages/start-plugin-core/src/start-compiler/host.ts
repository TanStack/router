import { StartCompiler, getLookupKindsForEnv } from './compiler'
import { getLookupConfigurationsForEnv } from './config'
import type {
  CompileStartFrameworkOptions,
  StartCompilerImportTransform,
} from '../types'
import type {
  DevServerFnModuleSpecifierEncoder,
  GenerateFunctionIdFnOptional,
  ServerFn,
} from './types'

export interface CreateStartCompilerOptions {
  env: 'client' | 'server'
  envName: string
  root: string
  framework: CompileStartFrameworkOptions
  providerEnvName: string
  mode: 'dev' | 'build'
  generateFunctionId?: GenerateFunctionIdFnOptional
  compilerTransforms?: Array<StartCompilerImportTransform> | undefined
  serverFnProviderModuleDirectives?: ReadonlyArray<string> | undefined
  onServerFnsById?: (d: Record<string, ServerFn>) => void
  getKnownServerFns: () => Record<string, ServerFn>
  encodeModuleSpecifierInDev?: DevServerFnModuleSpecifierEncoder
  loadModule: (id: string) => Promise<void>
  resolveId: (id: string, importer?: string) => Promise<string | null>
}

export function createStartCompiler(
  options: CreateStartCompilerOptions,
): StartCompiler {
  return new StartCompiler({
    env: options.env,
    envName: options.envName,
    root: options.root,
    lookupKinds: getLookupKindsForEnv(options.env, {
      compilerTransforms: options.compilerTransforms,
    }),
    lookupConfigurations: getLookupConfigurationsForEnv(
      options.env,
      options.framework,
      { compilerTransforms: options.compilerTransforms },
    ),
    mode: options.mode,
    framework: options.framework,
    providerEnvName: options.providerEnvName,
    generateFunctionId: options.generateFunctionId,
    onServerFnsById: options.onServerFnsById,
    compilerTransforms: options.compilerTransforms,
    serverFnProviderModuleDirectives: options.serverFnProviderModuleDirectives,
    getKnownServerFns: options.getKnownServerFns,
    devServerFnModuleSpecifierEncoder: options.encodeModuleSpecifierInDev,
    loadModule: options.loadModule,
    resolveId: options.resolveId,
  })
}

export function mergeServerFnsById(
  current: Record<string, ServerFn>,
  next: Record<string, ServerFn>,
): void {
  for (const [id, fn] of Object.entries(next)) {
    const existing = current[id]

    if (existing) {
      current[id] = {
        ...fn,
        isClientReferenced:
          existing.isClientReferenced || fn.isClientReferenced,
      }
      continue
    }

    current[id] = fn
  }
}

export function matchesCodeFilters(
  code: string,
  filters: ReadonlyArray<RegExp>,
): boolean {
  for (const pattern of filters) {
    if (pattern.test(code)) {
      return true
    }
  }

  return false
}
