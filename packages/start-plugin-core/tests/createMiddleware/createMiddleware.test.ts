import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { StartCompiler } from '../../src/start-compiler/compiler'

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
    getKnownServerFns: () => ({}),
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
      getKnownServerFns: () => ({}),
      resolveId: resolveIdMock,
    })

    await compiler.compile({
      code,
      id: 'test.ts',
    })

    // Direct known-library imports use the knownRootImports fast path, so they
    // do not need resolveId.
    expect(resolveIdMock).not.toHaveBeenCalled()
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
      getKnownServerFns: () => ({}),
      resolveId: resolveIdMock,
    })

    await compiler.compile({
      code: factoryCode,
      id: 'test.ts',
    })

    // resolveId should only be called for './factory'. Direct known-library
    // imports use the knownRootImports fast path.
    //
    // Note: The factory module's import from '@tanstack/react-start' ALSO uses
    // the fast path (knownRootImports), so no additional resolveId call is needed there.
    expect(resolveIdMock).toHaveBeenCalledTimes(1)
    expect(resolveIdMock).toHaveBeenNthCalledWith(1, './factory', 'test.ts')
  })
})
