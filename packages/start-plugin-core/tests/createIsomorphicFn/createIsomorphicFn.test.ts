import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, test, vi } from 'vitest'

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
    lookupKinds: new Set(['IsomorphicFn']),
    lookupConfigurations: [
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createIsomorphicFn',
        kind: 'IsomorphicFn',
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

async function getFilenames() {
  return await readdir(path.resolve(import.meta.dirname, './test-files'))
}

describe('createIsomorphicFn compiles correctly', async () => {
  const noImplWarning =
    'createIsomorphicFn called without a client or server implementation!'

  const originalConsoleWarn = console.warn
  const consoleSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
    // we want to avoid sending this warning to the console, we know about it
    if (args[0] === noImplWarning) {
      return
    }
    originalConsoleWarn(...args)
  })

  afterAll(() => {
    consoleSpy.mockRestore()
  })

  const filenames = await getFilenames()

  describe.each(filenames)('should handle "%s"', async (filename) => {
    const file = await readFile(
      path.resolve(import.meta.dirname, `./test-files/${filename}`),
    )
    const code = file.toString()

    test.each(['client', 'server'] as const)(
      `should compile for ${filename} %s`,
      async (env) => {
        const compiledResult = await compile({
          env,
          code,
          id: filename,
        })

        await expect(compiledResult!.code).toMatchFileSnapshot(
          `./snapshots/${env}/${filename}`,
        )
      },
    )
  })

  test('should error if implementation not provided', async () => {
    await expect(
      compile({
        env: 'client',
        code: `
        import { createIsomorphicFn } from '@tanstack/react-start'
        const clientOnly = createIsomorphicFn().client()`,
        id: 'no-fn.ts',
      }),
    ).rejects.toThrowError()

    await expect(
      compile({
        env: 'server',
        code: `
        import { createIsomorphicFn } from '@tanstack/react-start'
        const serverOnly = createIsomorphicFn().server()`,
        id: 'no-fn.ts',
      }),
    ).rejects.toThrowError()
  })

  test('should warn to console if no implementations provided', async () => {
    await compile({
      env: 'client',
      code: `
      import { createIsomorphicFn } from '@tanstack/react-start'
      const noImpl = createIsomorphicFn()`,
      id: 'no-fn.ts',
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      noImplWarning,
      'This will result in a no-op function.',
      'Variable name:',
      'noImpl',
    )
  })
})
