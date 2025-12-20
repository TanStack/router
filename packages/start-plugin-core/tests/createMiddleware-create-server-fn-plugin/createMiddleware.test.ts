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
    lookupKinds: new Set(['Middleware']),
    lookupConfigurations: [
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createMiddleware',
      },
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createStart',
      },
    ],
    resolveId: async (id) => {
      return id
    },
    directive: 'use server',
  })
  const result = await compiler.compile({
    code: opts.code,
    id: opts.id,
    isProviderFile: false,
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
})
