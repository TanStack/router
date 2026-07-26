declare module 'octane/compiler' {
  export function compile(
    source: string,
    filename: string,
    options?: { mode?: 'client' | 'server' },
  ): { code: string; map?: unknown }
}

declare module 'octane/compiler/volar' {
  export function compileToVolarMappings(
    source: string,
    filename?: string,
  ): { sourceAst: unknown }
}
