import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { ServerFnCompiler } from '../../src/create-server-fn-plugin/compiler'

async function getFilenames() {
  return await readdir(path.resolve(import.meta.dirname, './test-files'))
}

async function compile(opts: {
  env: 'client' | 'server'
  code: string
  id: string
}) {
  const compiler = new ServerFnCompiler({
    ...opts,
    loadModule: async (id) => {
      // do nothing in test
    },
    lookupConfigurations: [
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createMiddleware',
      },

      {
        libName: `@tanstack/react-start`,
        rootExport: 'createServerFn',
      },
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createStart',
      },
    ],
    resolveId: async (id) => {
      return id
    },
  })
  const result = await compiler.compile({ code: opts.code, id: opts.id })
  return result
}

describe('createMiddleware compiles correctly', async () => {
  const filenames = await getFilenames()

  describe.each(filenames)('should handle "%s"', async (filename) => {
    const file = await readFile(
      path.resolve(import.meta.dirname, `./test-files/${filename}`),
    )
    const code = file.toString()

    test.each(['client', 'server'] as const)(
      `should compile for ${filename} %s`,
      async (env) => {
        const result = await compile({ env, code, id: filename })

        await expect(result!.code).toMatchFileSnapshot(
          `./snapshots/${env}/${filename}`,
        )
      },
    )
  })
})
