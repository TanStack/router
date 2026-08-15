/** Minimal Bun ambient types for router-plugin bun entry. */

declare module 'bun' {
  export interface OnLoadResult {
    contents: string | Uint8Array
    loader?: 'js' | 'jsx' | 'ts' | 'tsx' | 'json' | 'toml' | 'file' | 'text'
  }

  export interface OnResolveResult {
    path: string
    namespace?: string
  }

  export interface PluginBuilder {
    onStart: (callback: () => void | Promise<void>) => void
    onResolve: (
      options: { filter: RegExp; namespace?: string },
      callback: (args: {
        path: string
        importer: string
        namespace: string
        kind: string
      }) => OnResolveResult | undefined | Promise<OnResolveResult | undefined>,
    ) => void
    onLoad: (
      options: { filter: RegExp; namespace?: string },
      callback: (args: {
        path: string
        namespace: string
      }) =>
        | OnLoadResult
        | undefined
        | Promise<OnLoadResult | undefined>
        | null,
    ) => void
  }

  export interface BunPlugin {
    name: string
    setup: (build: PluginBuilder) => void | Promise<void>
  }
}

declare var Bun: {
  plugin: (plugin: import('bun').BunPlugin) => void
}
