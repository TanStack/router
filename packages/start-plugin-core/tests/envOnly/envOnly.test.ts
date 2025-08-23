import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { compileStartOutputFactory } from '../../src/start-compiler-plugin/compilers'

const compileStartOutput = compileStartOutputFactory('react')

async function getFilenames() {
  return await readdir(path.resolve(import.meta.dirname, './test-files'))
}

describe('envOnly functions compile correctly', async () => {
  const filenames = await getFilenames()

  describe.each(filenames)('should handle "%s"', async (filename) => {
    const file = await readFile(
      path.resolve(import.meta.dirname, `./test-files/${filename}`),
    )
    const code = file.toString()

    test.each(['client', 'server'] as const)(
      `should compile for ${filename} %s`,
      async (env) => {
        const compiledResult = compileStartOutput({
          env,
          code,
          filename,
          dce: false,
        })

        await expect(compiledResult.code).toMatchFileSnapshot(
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
        import { createClientOnlyFn } from '@tanstack/react-start'
        const fn = createClientOnlyFn()`,
        filename: 'no-fn.ts',
        dce: false,
      })
    }).toThrowError()
    expect(() => {
      compileStartOutput({
        env: 'server',
        code: `
        import { createServerOnlyFn } from '@tanstack/react-start'
        const fn = createServerOnlyFn()`,
        filename: 'no-fn.ts',
        dce: false,
      })
    }).toThrowError()
  })
})
