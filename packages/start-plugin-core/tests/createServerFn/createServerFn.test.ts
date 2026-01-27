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

const TSS_SERVERFN_SPLIT_PARAM = 'tss-serverfn-split'

async function compile(opts: {
  env: 'client' | 'server'
  code: string
  isProviderFile: boolean
}) {
  // Use an absolute path inside the test root to ensure consistent filename output
  let id = '/test/src/test.ts'

  if (opts.isProviderFile) {
    id += `?${TSS_SERVERFN_SPLIT_PARAM}`
  }

  const compiler = new StartCompiler({
    ...opts,
    ...getDefaultTestOptions(opts.env),
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
  })
  const result = await compiler.compile({
    code: opts.code,
    id,
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

    test.each([
      { type: 'client', isProviderFile: false },
      { type: 'server', isProviderFile: false },
      { type: 'server', isProviderFile: true },
    ] as const)(`should compile for ${filename} %s`, async (env) => {
      const result = await compile({
        env: env.type,
        isProviderFile: env.isProviderFile,
        code,
      })

      const folder =
        env.type === 'client'
          ? 'client'
          : env.isProviderFile
            ? 'server-provider'
            : 'server-caller'
      await expect(result!.code).toMatchFileSnapshot(
        `./snapshots/${folder}/${filename}`,
      )
    })
  })

  test('should work with identifiers of functions', async () => {
    const code = `
        import { createServerFn } from '@tanstack/react-start'
        const myFunc = () => {
          return 'hello from the server'
        }
        const myServerFn = createServerFn().handler(myFunc)`

    const compiledResultClient = await compile({
      code,
      env: 'client',
      isProviderFile: false,
    })

    // Server caller (route file - no split param)
    // Should NOT have the second argument since implementation comes from extracted chunk
    const compiledResultServerCaller = await compile({
      code,
      env: 'server',
      isProviderFile: false,
    })

    // Server provider (extracted file - has split param)
    // Should HAVE the second argument since this is the implementation file
    const compiledResultServerProvider = await compile({
      code,
      env: 'server',
      isProviderFile: true,
    })

    expect(compiledResultClient!.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from '@tanstack/react-start/client-rpc';
      import { createServerFn } from '@tanstack/react-start';
      const myServerFn = createServerFn().handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJteVNlcnZlckZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));"
    `)

    // Server caller: no second argument (implementation from extracted chunk)
    expect(compiledResultServerCaller!.code).toMatchInlineSnapshot(`
      "import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
      import { createServerFn } from '@tanstack/react-start';
      const myServerFn = createServerFn().handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJteVNlcnZlckZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["myServerFn_createServerFn_handler"])));"
    `)

    // Server provider: has second argument (this is the implementation file)
    expect(compiledResultServerProvider!.code).toMatchInlineSnapshot(`
      "import { createServerRpc } from '@tanstack/react-start/server-rpc';
      import { createServerFn } from '@tanstack/react-start';
      const myFunc = () => {
        return 'hello from the server';
      };
      const myServerFn_createServerFn_handler = createServerRpc({
        id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJteVNlcnZlckZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
        name: "myServerFn",
        filename: "src/test.ts"
      }, (opts, signal) => myServerFn.__executeServer(opts, signal));
      const myServerFn = createServerFn().handler(myServerFn_createServerFn_handler, myFunc);
      export { myServerFn_createServerFn_handler };"
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
      code,
      env: 'client',
      isProviderFile: false,
    })

    expect(compiledResult!.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from '@tanstack/react-start/client-rpc';
      import { createServerFn } from '@tanstack/react-start';
      export const exportedFn = createServerFn().handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJleHBvcnRlZEZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));
      const nonExportedFn = createServerFn().handler(createClientRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJub25FeHBvcnRlZEZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));"
    `)

    // Server caller (route file) - no second argument
    const compiledResultServerCaller = await compile({
      code,
      env: 'server',
      isProviderFile: false,
    })

    expect(compiledResultServerCaller!.code).toMatchInlineSnapshot(`
      "import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
      import { createServerFn } from '@tanstack/react-start';
      export const exportedFn = createServerFn().handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJleHBvcnRlZEZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["exportedFn_createServerFn_handler"])));
      const nonExportedFn = createServerFn().handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJub25FeHBvcnRlZEZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["nonExportedFn_createServerFn_handler"])));"
    `)

    // Server provider (extracted file) - has second argument
    const compiledResultServerProvider = await compile({
      code,
      env: 'server',
      isProviderFile: true,
    })

    expect(compiledResultServerProvider!.code).toMatchInlineSnapshot(`
      "import { createServerRpc } from '@tanstack/react-start/server-rpc';
      import { createServerFn } from '@tanstack/react-start';
      const exportedVar = 'exported';
      const exportedFn_createServerFn_handler = createServerRpc({
        id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJleHBvcnRlZEZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
        name: "exportedFn",
        filename: "src/test.ts"
      }, (opts, signal) => exportedFn.__executeServer(opts, signal));
      const exportedFn = createServerFn().handler(exportedFn_createServerFn_handler, async () => {
        return exportedVar;
      });
      const nonExportedVar = 'non-exported';
      const nonExportedFn_createServerFn_handler = createServerRpc({
        id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJub25FeHBvcnRlZEZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
        name: "nonExportedFn",
        filename: "src/test.ts"
      }, (opts, signal) => nonExportedFn.__executeServer(opts, signal));
      const nonExportedFn = createServerFn().handler(nonExportedFn_createServerFn_handler, async () => {
        return nonExportedVar;
      });
      export { exportedFn_createServerFn_handler, nonExportedFn_createServerFn_handler };"
    `)
  })

  test('should use fast path for direct imports from known library (no extra resolveId calls)', async () => {
    const code = `
      import { createServerFn } from '@tanstack/react-start'
      const myServerFn = createServerFn().handler(async () => {
        return 'hello'
      })`

    const resolveIdMock = vi.fn(async (id: string) => id)

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
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
    })

    await compiler.compile({
      code,
      id: '/test/src/test.ts',
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

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
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
    })

    await compiler.compile({
      code: factoryCode,
      id: '/test/src/test.ts',
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
    expect(resolveIdMock).toHaveBeenNthCalledWith(
      2,
      './factory',
      '/test/src/test.ts',
    )
  })
})
