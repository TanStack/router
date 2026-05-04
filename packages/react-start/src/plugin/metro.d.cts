export interface WithTanStackStartOptions {
  /** Project root. Defaults to `process.cwd()`. */
  root?: string
  /**
   * Base URL of the deployed TanStack Start server. Replaces references to
   * `process.env.TSS_SERVER_FN_BASE` and `import.meta.env.TSS_SERVER_FN_BASE`
   * in transformed source so client RPC stubs target the right origin.
   */
  serverFnBase?: string
  /**
   * Override the upstream Metro Babel transformer (the one our wrapper
   * delegates to). Defaults to `@react-native/metro-babel-transformer`.
   */
  originalTransformerPath?: string
}

export interface MetroLikeConfig {
  transformer?: {
    babelTransformerPath?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export declare function withTanStackStart<T extends MetroLikeConfig>(
  metroConfig: T | Promise<T>,
  options?: WithTanStackStartOptions,
): Promise<T>
