import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { ServerFnCompiler } from '../../src/create-server-fn-plugin/compiler'

async function getFilenames() {
  return await readdir(path.resolve(import.meta.dirname, './test-files'))
}

async function compile(opts: {
  env: 'client' | 'server'
  code: string
  id: string
  isProviderFile: boolean
}) {
  const compiler = new ServerFnCompiler({
    ...opts,
    loadModule: async (id) => {
      // do nothing in test
    },
    lookupKinds: new Set(['ServerFn']),
    lookupConfigurations: [
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createServerFn',
        kind: 'Root',
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
    isProviderFile: opts.isProviderFile,
  })
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
        const result = await compile({
          env,
          code,
          id: filename,
          isProviderFile: env === 'server',
        })

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
      isProviderFile: false,
    })

    // Server caller (route file - no directive split param)
    // Should NOT have the second argument since implementation comes from extracted chunk
    const compiledResultServerCaller = await compile({
      id: 'test.ts',
      code,
      env: 'server',
      isProviderFile: false,
    })

    // Server provider (extracted file - has directive split param)
    // Should HAVE the second argument since this is the implementation file
    const compiledResultServerProvider = await compile({
      id: 'test.ts?tsr-directive-use-server',
      code,
      env: 'server',
      isProviderFile: true,
    })

    expect(compiledResultClient!.code).toMatchInlineSnapshot(`
      "import { createServerFn } from '@tanstack/react-start';
      const myServerFn = createServerFn().handler((opts, signal) => {
        "use server";

        return myServerFn.__executeServer(opts, signal);
      });"
    `)

    // Server caller: no second argument (implementation from extracted chunk)
    expect(compiledResultServerCaller!.code).toMatchInlineSnapshot(`
      "import { createServerFn } from '@tanstack/react-start';
      const myServerFn = createServerFn().handler((opts, signal) => {
        "use server";

        return myServerFn.__executeServer(opts, signal);
      });"
    `)

    // Server provider: has second argument (this is the implementation file)
    expect(compiledResultServerProvider!.code).toMatchInlineSnapshot(`
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
      isProviderFile: false,
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

    // Server caller (route file) - no second argument
    const compiledResultServerCaller = await compile({
      id: 'test.ts',
      code,
      env: 'server',
      isProviderFile: false,
    })

    expect(compiledResultServerCaller!.code).toMatchInlineSnapshot(`
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

    // Server provider (extracted file) - has second argument
    const compiledResultServerProvider = await compile({
      id: 'test.ts?tsr-directive-use-server',
      code,
      env: 'server',
      isProviderFile: true,
    })

    expect(compiledResultServerProvider!.code).toMatchInlineSnapshot(`
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

  test('should use fast path for direct imports from known library (no extra resolveId calls)', async () => {
    const code = `
      import { createServerFn } from '@tanstack/react-start'
      const myServerFn = createServerFn().handler(async () => {
        return 'hello'
      })`

    const resolveIdMock = vi.fn(async (id: string) => id)

    const compiler = new ServerFnCompiler({
      env: 'client',
      loadModule: async () => {},
      lookupKinds: new Set(['ServerFn']),
      lookupConfigurations: [
        {
          libName: '@tanstack/react-start',
          rootExport: 'createServerFn',
          kind: 'Root',
        },
      ],
      resolveId: resolveIdMock,
      directive: 'use server',
    })

    await compiler.compile({
      code,
      id: 'test.ts',
      isProviderFile: false,
    })

    // resolveId should only be called once during init() for the library itself
    // It should NOT be called again to resolve the import binding because
    // the fast path uses knownRootImports map for O(1) lookup
    expect(resolveIdMock).toHaveBeenCalledTimes(1)
    expect(resolveIdMock).toHaveBeenCalledWith(
      '@tanstack/react-start',
      undefined,
    )
  })

  test('should use slow path for factory pattern (resolveId called for import resolution)', async () => {
    // This simulates a factory pattern where createServerFn is re-exported from a local file
    const factoryCode = `
      import { createFooServerFn } from './factory'
      const myServerFn = createFooServerFn().handler(async () => {
        return 'hello'
      })`

    const resolveIdMock = vi.fn(async (id: string) => id)

    const compiler = new ServerFnCompiler({
      env: 'client',
      loadModule: async (id) => {
        // Simulate the factory module being loaded
        if (id === './factory') {
          compiler.ingestModule({
            code: `
              import { createServerFn } from '@tanstack/react-start'
              export const createFooServerFn = createServerFn
            `,
            id: './factory',
          })
        }
      },
      lookupKinds: new Set(['ServerFn']),
      lookupConfigurations: [
        {
          libName: '@tanstack/react-start',
          rootExport: 'createServerFn',
          kind: 'Root',
        },
      ],
      resolveId: resolveIdMock,
      directive: 'use server',
    })

    await compiler.compile({
      code: factoryCode,
      id: 'test.ts',
      isProviderFile: false,
    })

    // resolveId should be called exactly twice:
    // 1. Once during init() for '@tanstack/react-start'
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
