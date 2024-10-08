import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { compileStartOutput } from '../../src/compilers'

async function getFilenames() {
  return await readdir(path.resolve(import.meta.dirname, './test-files'))
}

describe('createServerMiddleware compiles correctly', async () => {
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
          env: env,
          code,
          root: './test-files',
          filename,
        })

        await expect(compiledResult.code).toMatchFileSnapshot(
          `./snapshots/${env}/${filename}`,
        )
      },
    )
  })
})

test('throws an error if createServerMiddleware is not assigned a variable', () => {
  expect(() =>
    compileStartOutput({
      env: 'server',
      code: `
        import { createServerMiddleware } from '@tanstack/start'

        createServerMiddleware({
          id: 'test',
        }).use(async function () {
          console.info('Fetching posts...')
        })`,
      root: './test-files',
      filename: 'no-named-exports.js',
    }),
  ).toThrowErrorMatchingInlineSnapshot(
    `[Error: createServerMiddleware must be assigned to a variable and exported!]`,
  )
})

test('throws an error if createServerMiddleware is not exported as a named export', () => {
  expect(() =>
    compileStartOutput({
      env: 'client',
      code: `
        import { createServerMiddleware } from '@tanstack/start'

        const testMiddleware = createServerMiddleware({
          id: 'test',
        }).use(async function () {
          console.info('Fetching posts...')
        })`,
      root: './test-files',
      filename: 'no-named-exports.js',
    }),
  ).toThrowErrorMatchingInlineSnapshot(
    `[Error: createServerMiddleware must be exported as a named export!]`,
  )
})
