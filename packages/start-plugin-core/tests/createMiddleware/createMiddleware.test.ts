import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { StartCompiler } from '../../src/start-compiler-plugin/compiler'

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

async function getFilenames() {
  return await readdir(path.resolve(import.meta.dirname, './test-files'))
}

async function compile(opts: {
  env: 'client' | 'server'
  code: string
  id: string
}) {
  const compiler = new StartCompiler({
    ...opts,
    ...getDefaultTestOptions(opts.env),
    loadModule: async () => {
      // do nothing in test
    },
    lookupKinds: new Set(['Middleware']),
    lookupConfigurations: [
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createMiddleware',
        kind: 'Root',
      },
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createStart',
        kind: 'Root',
      },
    ],
    resolveId: async (id) => {
      return id
    },
  })
  const result = await compiler.compile({
    code: opts.code,
    id: opts.id,
  })
  return result
}

describe('createMiddleware compiles correctly', async () => {
  const filenames = await getFilenames()

  describe.each(filenames)('should handle "%s"', async (filename) => {
    const file = await readFile(
      path.resolve(import.meta.dirname, `./test-files/${filename}`),
    )
    const code = file.toString()

    // Note: Middleware compilation only happens on the client
    test(`should compile for ${filename} client`, async () => {
      const result = await compile({ env: 'client', code, id: filename })

      await expect(result!.code).toMatchFileSnapshot(
        `./snapshots/client/${filename}`,
      )
    })
  })

  test('should use fast path for direct imports from known library (no extra resolveId calls)', async () => {
    const code = `
      import { createMiddleware } from '@tanstack/react-start'
      const myMiddleware = createMiddleware().server(async ({ next }) => {
        return next()
      })`

    const resolveIdMock = vi.fn(async (id: string) => id)

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      loadModule: async () => {},
      lookupKinds: new Set(['Middleware']),
      lookupConfigurations: [
        {
          libName: '@tanstack/react-start',
          rootExport: 'createMiddleware',
          kind: 'Root',
        },
      ],
      resolveId: resolveIdMock,
    })

    await compiler.compile({
      code,
      id: 'test.ts',
    })

    // resolveId should only be called once during init() for the library itself
    // It should NOT be called again to resolve the import binding because
    // the fast path uses knownRootImports map for O(1) lookup
    // Note: init() now resolves from project root, not from a specific file
    expect(resolveIdMock).toHaveBeenCalledTimes(1)
    expect(resolveIdMock).toHaveBeenCalledWith(
      '@tanstack/react-start',
      undefined,
    )
  })

  test('should use slow path for factory pattern (resolveId called for import resolution)', async () => {
    // This simulates a factory pattern where createMiddleware is re-exported from a local file
    const factoryCode = `
      import { createFooMiddleware } from './factory'
      const myMiddleware = createFooMiddleware().server(async ({ next }) => {
        return next()
      })`

    const resolveIdMock = vi.fn(async (id: string) => id)

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      loadModule: async (id) => {
        // Simulate the factory module being loaded
        if (id === './factory') {
          compiler.ingestModule({
            code: `
              import { createMiddleware } from '@tanstack/react-start'
              export const createFooMiddleware = createMiddleware
            `,
            id: './factory',
          })
        }
      },
      lookupKinds: new Set(['Middleware']),
      lookupConfigurations: [
        {
          libName: '@tanstack/react-start',
          rootExport: 'createMiddleware',
          kind: 'Root',
        },
      ],
      resolveId: resolveIdMock,
    })

    await compiler.compile({
      code: factoryCode,
      id: 'test.ts',
    })

    // resolveId should be called exactly twice:
    // 1. Once during init() for '@tanstack/react-start' (no importer - resolved from project root)
    // 2. Once to resolve './factory' import (slow path - not in knownRootImports)
    //
    // Note: The factory module's import from '@tanstack/react-start' ALSO uses
    // the fast path (knownRootImports), so no additional resolveId call is needed there.
    expect(resolveIdMock).toHaveBeenCalledTimes(2)
    expect(resolveIdMock).toHaveBeenNthCalledWith(
      1,
      '@tanstack/react-start',
      undefined,
    )
    expect(resolveIdMock).toHaveBeenNthCalledWith(2, './factory', 'test.ts')
  })
})
