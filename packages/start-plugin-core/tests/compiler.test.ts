import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
} from '../src/start-compiler-plugin/compiler'
import type {
  LookupConfig,
  LookupKind,
} from '../src/start-compiler-plugin/compiler'

// Default test options for StartCompiler
function getDefaultTestOptions(env: 'client' | 'server') {
  const envName = env === 'client' ? 'client' : 'ssr'
  return {
    envName,
    root: '/test',
    framework: 'react' as const,
    providerEnvName: 'ssr',
  }
}

// Helper to create a compiler with all kinds enabled
function createFullCompiler(env: 'client' | 'server') {
  const lookupKinds: Set<LookupKind> =
    env === 'client'
      ? new Set([
          'ServerFn',
          'Middleware',
          'IsomorphicFn',
          'ServerOnlyFn',
          'ClientOnlyFn',
        ])
      : new Set(['ServerFn', 'IsomorphicFn', 'ServerOnlyFn', 'ClientOnlyFn'])

  const lookupConfigurations: Array<LookupConfig> = [
    {
      libName: '@tanstack/react-start',
      rootExport: 'createServerFn',
      kind: 'Root',
    },
    {
      libName: '@tanstack/react-start',
      rootExport: 'createMiddleware',
      kind: 'Root',
    },
    {
      libName: '@tanstack/react-start',
      rootExport: 'createIsomorphicFn',
      kind: 'IsomorphicFn',
    },
    {
      libName: '@tanstack/react-start',
      rootExport: 'createServerOnlyFn',
      kind: 'ServerOnlyFn',
    },
    {
      libName: '@tanstack/react-start',
      rootExport: 'createClientOnlyFn',
      kind: 'ClientOnlyFn',
    },
  ]

  return new StartCompiler({
    env,
    ...getDefaultTestOptions(env),
    lookupKinds,
    lookupConfigurations,
    loadModule: async () => {},
    resolveId: async (id) => id,
  })
}

describe('detectKindsInCode', () => {
  describe('detects individual kinds correctly', () => {
    test('detects ServerFn via .handler(', () => {
      const code = `
        import { createServerFn } from '@tanstack/react-start'
        const fn = createServerFn().handler(() => 'hello')
      `
      expect(detectKindsInCode(code, 'client')).toEqual(new Set(['ServerFn']))
      expect(detectKindsInCode(code, 'server')).toEqual(new Set(['ServerFn']))
    })

    test('detects Middleware', () => {
      const code = `
        import { createMiddleware } from '@tanstack/react-start'
        const mw = createMiddleware().server(({ next }) => next())
      `
      // Middleware is only valid on client
      expect(detectKindsInCode(code, 'client')).toEqual(new Set(['Middleware']))
      expect(detectKindsInCode(code, 'server')).toEqual(new Set())
    })

    test('detects IsomorphicFn', () => {
      const code = `
        import { createIsomorphicFn } from '@tanstack/react-start'
        const fn = createIsomorphicFn().client(() => 'c').server(() => 's')
      `
      expect(detectKindsInCode(code, 'client')).toEqual(
        new Set(['IsomorphicFn']),
      )
      expect(detectKindsInCode(code, 'server')).toEqual(
        new Set(['IsomorphicFn']),
      )
    })

    test('detects ServerOnlyFn', () => {
      const code = `
        import { createServerOnlyFn } from '@tanstack/react-start'
        const fn = createServerOnlyFn(() => 'server only')
      `
      expect(detectKindsInCode(code, 'client')).toEqual(
        new Set(['ServerOnlyFn']),
      )
      expect(detectKindsInCode(code, 'server')).toEqual(
        new Set(['ServerOnlyFn']),
      )
    })

    test('detects ClientOnlyFn', () => {
      const code = `
        import { createClientOnlyFn } from '@tanstack/react-start'
        const fn = createClientOnlyFn(() => 'client only')
      `
      expect(detectKindsInCode(code, 'client')).toEqual(
        new Set(['ClientOnlyFn']),
      )
      expect(detectKindsInCode(code, 'server')).toEqual(
        new Set(['ClientOnlyFn']),
      )
    })
  })

  describe('detects multiple kinds in same file', () => {
    test('detects ServerFn and IsomorphicFn', () => {
      const code = `
        import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'
        const serverFn = createServerFn().handler(() => 'hello')
        const isoFn = createIsomorphicFn().client(() => 'client')
      `
      expect(detectKindsInCode(code, 'client')).toEqual(
        new Set(['ServerFn', 'IsomorphicFn']),
      )
    })

    test('detects all kinds on client', () => {
      const code = `
        import { createServerFn, createMiddleware, createIsomorphicFn, createServerOnlyFn, createClientOnlyFn } from '@tanstack/react-start'
        const a = createServerFn().handler(() => {})
        const b = createMiddleware().server(({ next }) => next())
        const c = createIsomorphicFn()
        const d = createServerOnlyFn(() => {})
        const e = createClientOnlyFn(() => {})
      `
      expect(detectKindsInCode(code, 'client')).toEqual(
        new Set([
          'ServerFn',
          'Middleware',
          'IsomorphicFn',
          'ServerOnlyFn',
          'ClientOnlyFn',
        ]),
      )
    })

    test('detects all valid kinds on server (excludes Middleware)', () => {
      const code = `
        import { createServerFn, createMiddleware, createIsomorphicFn, createServerOnlyFn, createClientOnlyFn } from '@tanstack/react-start'
        const a = createServerFn().handler(() => {})
        const b = createMiddleware().server(({ next }) => next())
        const c = createIsomorphicFn()
        const d = createServerOnlyFn(() => {})
        const e = createClientOnlyFn(() => {})
      `
      // Middleware should NOT be detected on server
      expect(detectKindsInCode(code, 'server')).toEqual(
        new Set(['ServerFn', 'IsomorphicFn', 'ServerOnlyFn', 'ClientOnlyFn']),
      )
    })
  })

  describe('handles edge cases', () => {
    test('returns empty set for code with no matching patterns', () => {
      const code = `
        const foo = 'bar'
        function hello() { return 'world' }
      `
      expect(detectKindsInCode(code, 'client')).toEqual(new Set())
      expect(detectKindsInCode(code, 'server')).toEqual(new Set())
    })

    test('handles .handler with whitespace variations', () => {
      const code1 = `fn.handler(() => {})`
      const code2 = `fn.handler  (() => {})`
      const code3 = `fn.handler\n(() => {})`
      const code4 = `fn.handler\t(() => {})`

      expect(detectKindsInCode(code1, 'client')).toEqual(new Set(['ServerFn']))
      expect(detectKindsInCode(code2, 'client')).toEqual(new Set(['ServerFn']))
      expect(detectKindsInCode(code3, 'client')).toEqual(new Set(['ServerFn']))
      expect(detectKindsInCode(code4, 'client')).toEqual(new Set(['ServerFn']))
    })

    test('handles whitespace between . and handler (reformatted code)', () => {
      // When Vite/Babel reformats code, the dot can end up on a previous line
      const code1 = `fn.\nhandler(() => {})`
      const code2 = `fn.\n  handler(() => {})`
      const code3 = `fn.  \n  handler(() => {})`

      expect(detectKindsInCode(code1, 'client')).toEqual(new Set(['ServerFn']))
      expect(detectKindsInCode(code2, 'client')).toEqual(new Set(['ServerFn']))
      expect(detectKindsInCode(code3, 'client')).toEqual(new Set(['ServerFn']))
    })

    test('detects createServerFn() call directly', () => {
      // The pattern should match createServerFn() calls, not just .handler()
      const code = `
        import { createServerFn } from '@tanstack/react-start'
        const fn = createServerFn()
      `
      expect(detectKindsInCode(code, 'client')).toEqual(new Set(['ServerFn']))
    })

    test('does not false positive on similar function names', () => {
      // Only exact createServerFn( should match, not variations
      const code = `
        const fn = createServerFnExample()
        const fn2 = createServerFnLike()
        const fn3 = mycreateServerFn()
        const fn4 = _createServerFn()
      `
      expect(detectKindsInCode(code, 'client')).toEqual(new Set())
    })

    test('does not false positive on similar names', () => {
      const code = `
        const myCreateServerFn = () => {}
        const createServerFnLike = () => {}
        // But this should match:
        createServerFn().handler(() => {})
      `
      // Should only match because of .handler(, not because of variable names
      expect(detectKindsInCode(code, 'client')).toEqual(new Set(['ServerFn']))
    })
  })
})

describe('compiler handles multiple files with different kinds', () => {
  test('single compiler instance correctly processes files with different kinds in succession', async () => {
    const compiler = createFullCompiler('client')

    // File 1: ServerFn only
    const result1 = await compiler.compile({
      code: `
        import { createServerFn } from '@tanstack/react-start'
        export const fn = createServerFn().handler(() => 'hello')
      `,
      id: 'file1.ts',

      detectedKinds: new Set(['ServerFn']),
    })
    expect(result1).not.toBeNull()
    expect(result1!.code).toContain('createClientRpc') // Client should have RPC stub
    expect(result1!.code).not.toContain('createMiddleware')
    expect(result1!.code).not.toContain('createIsomorphicFn')

    // File 2: Middleware only
    const result2 = await compiler.compile({
      code: `
        import { createMiddleware } from '@tanstack/react-start'
        export const mw = createMiddleware().server(({ next }) => {
          console.log('server only')
          return next()
        })
      `,
      id: 'file2.ts',

      detectedKinds: new Set(['Middleware']),
    })
    expect(result2).not.toBeNull()
    // .server() should be stripped on client
    expect(result2!.code).not.toContain('console.log')
    expect(result2!.code).not.toContain('createServerFn')

    // File 3: IsomorphicFn only
    const result3 = await compiler.compile({
      code: `
        import { createIsomorphicFn } from '@tanstack/react-start'
        export const fn = createIsomorphicFn()
          .client(() => 'client-value')
          .server(() => 'server-value')
      `,
      id: 'file3.ts',

      detectedKinds: new Set(['IsomorphicFn']),
    })
    expect(result3).not.toBeNull()
    // Client should have client implementation
    expect(result3!.code).toContain('client-value')
    expect(result3!.code).not.toContain('server-value')

    // File 4: ServerOnlyFn only
    const result4 = await compiler.compile({
      code: `
        import { createServerOnlyFn } from '@tanstack/react-start'
        export const fn = createServerOnlyFn(() => 'server only value')
      `,
      id: 'file4.ts',

      detectedKinds: new Set(['ServerOnlyFn']),
    })
    expect(result4).not.toBeNull()
    // Client should have error throw
    expect(result4!.code).toContain('throw new Error')
    expect(result4!.code).not.toContain('server only value')

    // File 5: Mix of ServerFn and IsomorphicFn
    const result5 = await compiler.compile({
      code: `
        import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'
        export const serverFn = createServerFn().handler(() => 'hello')
        export const isoFn = createIsomorphicFn().client(() => 'client-iso')
      `,
      id: 'file5.ts',

      detectedKinds: new Set(['ServerFn', 'IsomorphicFn']),
    })
    expect(result5).not.toBeNull()
    expect(result5!.code).toContain('createClientRpc') // ServerFn RPC
    expect(result5!.code).toContain('client-iso') // IsomorphicFn client impl
  })

  test('compiler works correctly when processing same kind multiple times', async () => {
    const compiler = createFullCompiler('client')

    // First file with IsomorphicFn
    const result1 = await compiler.compile({
      code: `
        import { createIsomorphicFn } from '@tanstack/react-start'
        export const fn1 = createIsomorphicFn().client(() => 'first')
      `,
      id: 'first.ts',

      detectedKinds: new Set(['IsomorphicFn']),
    })
    expect(result1!.code).toContain('first')

    // Second file with different IsomorphicFn
    const result2 = await compiler.compile({
      code: `
        import { createIsomorphicFn } from '@tanstack/react-start'
        export const fn2 = createIsomorphicFn().client(() => 'second')
      `,
      id: 'second.ts',

      detectedKinds: new Set(['IsomorphicFn']),
    })
    expect(result2!.code).toContain('second')
    expect(result2!.code).not.toContain('first') // Should not leak from previous file
  })

  test('server environment excludes Middleware from detected kinds', async () => {
    const compiler = createFullCompiler('server')

    // Even if Middleware is in detectedKinds, server env should ignore it
    const result = await compiler.compile({
      code: `
        import { createMiddleware } from '@tanstack/react-start'
        export const mw = createMiddleware().server(({ next }) => next())
      `,
      id: 'middleware.ts',

      // Intentionally including Middleware even though it's server env
      detectedKinds: new Set(['Middleware']),
    })
    // Should return null since Middleware is not valid on server
    expect(result).toBeNull()
  })
})

describe('edge cases for detectedKinds', () => {
  test('empty detectedKinds returns null (no candidates to process)', async () => {
    const compiler = createFullCompiler('client')

    const result = await compiler.compile({
      code: `
        // This file somehow passed Vite filter but has no actual kinds
        const foo = 'bar'
        // Maybe a false positive match like "handler(" in a comment
        // .handler( in string
      `,
      id: 'empty.ts',

      detectedKinds: new Set(), // Empty set
    })

    expect(result).toBeNull()
  })

  test('detectedKinds not provided falls back to all valid kinds', async () => {
    const compiler = createFullCompiler('client')

    // When detectedKinds is not provided, should check all valid kinds
    const result = await compiler.compile({
      code: `
        import { createIsomorphicFn } from '@tanstack/react-start'
        export const fn = createIsomorphicFn().client(() => 'works')
      `,
      id: 'no-detected.ts',

      // No detectedKinds provided
    })

    expect(result).not.toBeNull()
    expect(result!.code).toContain('works')
  })

  test('detectedKinds with invalid kinds for env are filtered out', async () => {
    const compiler = createFullCompiler('server')

    // Passing Middleware (invalid for server) along with valid kind
    const result = await compiler.compile({
      code: `
        import { createIsomorphicFn } from '@tanstack/react-start'
        export const fn = createIsomorphicFn().server(() => 'server-impl')
      `,
      id: 'filtered.ts',

      detectedKinds: new Set(['Middleware', 'IsomorphicFn']), // Middleware should be filtered
    })

    expect(result).not.toBeNull()
    expect(result!.code).toContain('server-impl')
  })
})

test('ingestModule handles empty code gracefully', () => {
  const compiler = new StartCompiler({
    env: 'client',
    ...getDefaultTestOptions('client'),
    lookupKinds: new Set(['ServerFn']),
    lookupConfigurations: [],
    loadModule: async () => {},
    resolveId: async (id) => id,
  })

  // Should not throw when ingesting empty module
  expect(() => {
    compiler.ingestModule({ code: '', id: 'empty-types.ts' })
  }).not.toThrow()

  // Should also handle whitespace-only modules
  expect(() => {
    compiler.ingestModule({ code: '   \n\t  ', id: 'whitespace.ts' })
  }).not.toThrow()
})
