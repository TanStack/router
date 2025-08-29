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
    libName: '@tanstack/react-start',
    loadModule: async (id) => {
      // do nothing in test
    },
    rootExport: 'createServerFn',
    resolveId: async (id) => {
      return id
    },
  })
  const result = await compiler.compile({ code: opts.code, id: opts.id })
  return result
}

describe('createServerFn compiles correctly', async () => {
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

  test('should work with identifiers of functions', async () => {
    const code = `
        import { createServerFn } from '@tanstack/react-start'
        const myFunc = () => {
          return 'hello from the server'
        }
        const myServerFn = createServerFn().handler(myFunc)`

    const compiledResultClient = await compile({
      id: 'test.ts',
      code,
      env: 'client',
    })

    const compiledResultServer = await compile({
      id: 'test.ts',
      code,
      env: 'server',
    })

    expect(compiledResultClient!.code).toMatchInlineSnapshot(`
      "import { createServerFn } from '@tanstack/react-start';
      const myServerFn = createServerFn().handler((opts, signal) => {
        "use server";

        return myServerFn.__executeServer(opts, signal);
      });"
    `)

    expect(compiledResultServer!.code).toMatchInlineSnapshot(`
      "import { createServerFn } from '@tanstack/react-start';
      const myFunc = () => {
        return 'hello from the server';
      };
      const myServerFn = createServerFn().handler((opts, signal) => {
        "use server";

        return myServerFn.__executeServer(opts, signal);
      }, myFunc);"
    `)
  })

  test('should use dce by default', async () => {
    const code = `
      import { createServerFn } from '@tanstack/react-start'
      const exportedVar = 'exported'
      export const exportedFn = createServerFn().handler(async () => {
        return exportedVar
      })
      const nonExportedVar = 'non-exported'
      const nonExportedFn = createServerFn().handler(async () => {
        return nonExportedVar
      })`

    // Client
    const compiledResult = await compile({
      id: 'test.ts',
      code,
      env: 'client',
    })

    expect(compiledResult!.code).toMatchInlineSnapshot(`
      "import { createServerFn } from '@tanstack/react-start';
      export const exportedFn = createServerFn().handler((opts, signal) => {
        "use server";

        return exportedFn.__executeServer(opts, signal);
      });
      const nonExportedFn = createServerFn().handler((opts, signal) => {
        "use server";

        return nonExportedFn.__executeServer(opts, signal);
      });"
    `)

    // Server
    const compiledResultServer = await compile({
      id: 'test.ts',
      code,
      env: 'server',
    })

    expect(compiledResultServer!.code).toMatchInlineSnapshot(`
      "import { createServerFn } from '@tanstack/react-start';
      const exportedVar = 'exported';
      export const exportedFn = createServerFn().handler((opts, signal) => {
        "use server";

        return exportedFn.__executeServer(opts, signal);
      }, async () => {
        return exportedVar;
      });
      const nonExportedVar = 'non-exported';
      const nonExportedFn = createServerFn().handler((opts, signal) => {
        "use server";

        return nonExportedFn.__executeServer(opts, signal);
      }, async () => {
        return nonExportedVar;
      });"
    `)
  })
})
