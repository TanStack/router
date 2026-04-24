import type { TanStackStartOutputConfig } from './schema'

export type CompileStartFrameworkOptions = 'react' | 'solid' | 'vue'

export type ServerFnLookupAccess = { origin: 'client' } | { origin: 'server' }

export type SerializationRuntime = 'client' | 'server'

export interface SerializationAdapterModuleRef {
  module: string
  export: string
  isFactory?: boolean
}

export type SerializationAdapterByRuntime = Partial<
  Record<SerializationRuntime, SerializationAdapterModuleRef>
>

export type SerializationAdapterConfig =
  | SerializationAdapterModuleRef
  | SerializationAdapterByRuntime

export interface NormalizedBasePaths {
  publicBase: string
  assetBase: {
    dev: string
    build: string
  }
}

export interface NormalizedOutputDirectories {
  client: string
  server: string
}

export interface NormalizedClientChunk {
  fileName: string
  isEntry: boolean
  imports: Array<string>
  dynamicImports: Array<string>
  css: Array<string>
  routeFilePaths: Array<string>
}

export interface NormalizedClientBuild {
  entryChunkFileName: string
  chunksByFileName: ReadonlyMap<string, NormalizedClientChunk>
  chunkFileNamesByRouteFilePath: ReadonlyMap<string, ReadonlyArray<string>>
  cssFilesBySourcePath: ReadonlyMap<string, ReadonlyArray<string>>
  cssContentByFileName?: ReadonlyMap<string, string>
}

export interface TanStackStartCoreOptions {
  framework: CompileStartFrameworkOptions
  defaultEntryPaths: {
    client: string
    server: string
    start: string
  }
  providerEnvironmentName: string
  ssrIsProvider: boolean
  serializationAdapters?: Array<SerializationAdapterConfig> | undefined
}

export interface ResolvedStartConfig {
  root: string
  startFilePath: string | undefined
  routerFilePath: string
  srcDirectory: string
  basePaths: NormalizedBasePaths
  outputDirectories: NormalizedOutputDirectories
}

export type GetConfigFn = () => {
  startConfig: TanStackStartOutputConfig
  resolvedStartConfig: ResolvedStartConfig
}
