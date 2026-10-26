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
  /**
   * Chunks this chunk imports statically. Rolldown and Rsbuild report direct
   * imports only, so consumers must walk the graph to reach transitive chunks
   * instead of treating the list as complete.
   */
  imports: Array<string>
  dynamicImports: Array<string>
  css: Array<string>
  routeFilePaths: Array<string>
  hydrationIds: Array<string>
}

export interface NormalizedClientBuild {
  entryChunkFileName: string
  chunksByFileName: ReadonlyMap<string, NormalizedClientChunk>
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
  /** React Server Components integration: the host's CSS loader and the provider module directive. */
  rsc?: StartRscOptions | undefined
}

/** What an RSC integration passes the compiler (J7). */
export interface StartRscOptions {
  /** The RSC host's CSS loader expression, emitted as source text in the modules that render server components. */
  loadCssExpression: string
  /** The directive a derived server-fn provider module carries (Rsbuild: `'use server-entry'`). */
  providerDirective?: string | undefined
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
