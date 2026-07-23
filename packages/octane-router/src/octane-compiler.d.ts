declare module 'octane/compiler/vite' {
  import type { Plugin } from 'vite'

  export interface OctaneRendererDescriptor {
    module: string
    target?: 'dom' | 'universal'
    server?: 'render' | 'client-only' | 'unsupported'
    intrinsics?: string
    text?: 'reject' | 'ignore' | 'host'
    capabilities?: ReadonlyArray<string>
  }

  export interface OctaneRendererBoundary {
    ownerRenderer: string
    childRenderer: string
    prop: string
    server?: 'omit-child'
  }

  export interface OctaneRendererRule {
    include: string | ReadonlyArray<string>
    exclude?: string | ReadonlyArray<string>
    renderer: string
  }

  export interface OctaneRendererConfig {
    default?: string
    registry?: Record<string, string | OctaneRendererDescriptor>
    rules?: ReadonlyArray<OctaneRendererRule>
    boundaries?: Record<string, Record<string, OctaneRendererBoundary>>
  }

  export interface OctaneCompilerOptions {
    exclude?: ReadonlyArray<string>
    hmr?: boolean
    profile?: boolean
    renderers?: OctaneRendererConfig
  }

  export function octane(options?: OctaneCompilerOptions): Plugin
}

declare module 'octane/compiler/volar' {
  export interface VolarCompileResult {
    code: string
    mappings: Array<unknown>
    cssMappings: Array<unknown>
    scriptMappings: Array<unknown>
    sourceAst: unknown
    errors: Array<unknown>
  }

  export function compileToVolarMappings(
    source: string,
    filename?: string,
  ): VolarCompileResult
}
