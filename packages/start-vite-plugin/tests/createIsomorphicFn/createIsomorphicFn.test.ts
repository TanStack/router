import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, test, vi } from 'vitest'

import { compileStartOutput } from '../../src/compilers'

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
        const { compiled } = compileStartOutput({
          env,
          code,
          root: './test-files',
          filename,
        })

        await expect(compiled.code).toMatchFileSnapshot(
          `./snapshots/${env}/${filename}`,
        )
      },
    )
  })
  test('should error if implementation not provided', () => {
    expect(() => {
      compileStartOutput({
        env: 'client',
        code: `
        import { createIsomorphicFn } from '@tanstack/start'
        const clientOnly = createIsomorphicFn().client()`,
        root: './test-files',
        filename: 'no-fn.ts',
      })
    }).toThrowError()
    expect(() => {
      compileStartOutput({
        env: 'server',
        code: `
        import { createIsomorphicFn } from '@tanstack/start'
        const serverOnly = createIsomorphicFn().server()`,
        root: './test-files',
        filename: 'no-fn.ts',
      })
    }).toThrowError()
  })
  test('should warn to console if no implementations provided', () => {
    compileStartOutput({
      env: 'client',
      code: `
      import { createIsomorphicFn } from '@tanstack/start'
      const noImpl = createIsomorphicFn()`,
      root: './test-files',
      filename: 'no-fn.ts',
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      noImplWarning,
      'This will result in a no-op function.',
      'Variable name:',
      'noImpl',
    )
  })
})
