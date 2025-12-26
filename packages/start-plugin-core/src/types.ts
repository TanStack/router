import type { TanStackStartOutputConfig } from './schema'

export type CompileStartFrameworkOptions = 'react' | 'solid' | 'vue'

export interface TanStackStartVitePluginCoreOptions {
  framework: CompileStartFrameworkOptions
  defaultEntryPaths: {
    client: string
    server: string
    start: string
  }
  serverFn?: {
    ssr?: {
      getServerFnById?: string
    }
    providerEnv?: string
  }
}

export interface ResolvedStartConfig {
  root: string
  startFilePath: string | undefined
  routerFilePath: string
  srcDirectory: string
  viteAppBase: string
  viteConfigFile?: string
  serverFnProviderEnv: string
}

export type GetConfigFn = () => {
  startConfig: TanStackStartOutputConfig
  resolvedStartConfig: ResolvedStartConfig
  corePluginOpts: TanStackStartVitePluginCoreOptions
}
