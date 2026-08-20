/** Minimal Bun ambient types for the Start bun adapter (local fork). */

declare module 'bun' {
  export type Loader =
    | 'js'
    | 'jsx'
    | 'ts'
    | 'tsx'
    | 'json'
    | 'toml'
    | 'text'
    | 'file'
    | 'wasm'
    | 'napi'
    | 'html'
    | 'css'
    | 'object'

  export interface BunPlugin {
    name: string
    setup: (build: PluginBuilder) => void | Promise<void>
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
      }) =>
        | { path: string; namespace?: string }
        | undefined
        | Promise<{ path: string; namespace?: string } | undefined>,
    ) => void
    onLoad: (
      options: { filter: RegExp; namespace?: string },
      callback: (args: {
        path: string
        namespace: string
      }) =>
        | { contents: string; loader?: Loader }
        | undefined
        | Promise<{ contents: string; loader?: Loader } | undefined>,
    ) => void
  }

  export interface BuildConfig {
    entrypoints: Array<string>
    outdir?: string
    outfile?: string
    target?: 'browser' | 'bun' | 'node'
    format?: 'esm' | 'cjs' | 'iife'
    splitting?: boolean
    minify?: boolean
    sourcemap?: boolean | 'none' | 'linked' | 'external' | 'inline'
    naming?: string | { entry?: string; chunk?: string; asset?: string }
    define?: Record<string, string>
    plugins?: Array<BunPlugin>
    packages?: 'bundle' | 'external'
    /** Standalone executable (Bun --compile). */
    compile?: boolean | string | Record<string, unknown>
  }

  export interface BuildArtifact {
    path: string
    kind: 'entry-point' | 'chunk' | 'asset' | 'sourcemap' | string
  }

  export interface BuildOutput {
    success: boolean
    outputs: Array<BuildArtifact>
    logs: Array<{ message: string }>
  }

  export function build(config: BuildConfig): Promise<BuildOutput>
  export function plugin(plugin: BunPlugin): void
  export function resolve(id: string, from?: string): Promise<string>
  export function resolveSync(id: string, from?: string): string
  export function sleep(ms: number): Promise<void>
  export function serve(options: {
    port?: number
    hostname?: string
    fetch: (req: Request) => Response | Promise<Response>
  }): { port: number; stop: (closeActiveConnections?: boolean) => void }
  export function file(
    path: string,
  ): {
    exists: () => Promise<boolean>
  } & Blob

  export class Transpiler {
    constructor(options?: { loader?: Loader })
    transformSync(code: string, loader?: Loader): string
    transform(code: string, loader?: Loader): Promise<string>
  }

  export interface GlobScanOptions {
    cwd?: string
    dot?: boolean
    absolute?: boolean
    followSymlinks?: boolean
    throwErrorOnBrokenSymlink?: boolean
    onlyFiles?: boolean
  }

  export class Glob {
    constructor(pattern: string)
    scan(optionsOrCwd?: string | GlobScanOptions): AsyncIterableIterator<string>
    scanSync(optionsOrCwd?: string | GlobScanOptions): IterableIterator<string>
    match(str: string): boolean
  }

  const Bun: {
    build: typeof build
    plugin: typeof plugin
    resolve: typeof resolve
    resolveSync: typeof resolveSync
    serve: typeof serve
    file: typeof file
    sleep: typeof sleep
    Transpiler: typeof Transpiler
    Glob: typeof Glob
  }

  export default Bun
}

declare var Bun: typeof import('bun').default
