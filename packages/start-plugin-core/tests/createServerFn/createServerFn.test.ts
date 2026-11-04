import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { describe, expect, test, vi } from 'vitest'
import { StartCompiler } from '../../src/start-compiler/compiler'
import { formatSnapshot } from '../format-snapshot'

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
  parserFilename?: string
  isProviderFile: boolean
  mode: 'dev' | 'build'
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
    getKnownServerFns: () => ({}),
    resolveId: async (id) => {
      return id
    },
  })
  const result = await compiler.compile({
    code: opts.code,
    id,
    parserFilename: opts.parserFilename,
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
        parserFilename: `/test/src/${filename}`,
        mode: 'build',
      })

      const folder =
        env.type === 'client'
          ? 'client'
          : env.isProviderFile
            ? 'server-provider'
            : 'server-caller'
      await expect(
        await formatSnapshot(result!.code, filename),
      ).toMatchFileSnapshot(`./snapshots/${folder}/${filename}`)
    })
  })

  test('should compile validator method', async () => {
    const code = `
        import { createServerFn } from '@tanstack/react-start'
        const myServerFn = createServerFn()
          .validator((input: string) => input)
          .handler(({ input }) => input)`

    const compiledResultClient = await compile({
      code,
      env: 'client',
      isProviderFile: false,
      mode: 'build',
    })

    expect(await formatSnapshot(compiledResultClient!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
        "import { createClientRpc } from '@tanstack/react-start/client-rpc'
        import { createServerFn } from '@tanstack/react-start'
        const myServerFn = createServerFn().handler(
          createClientRpc('WYpJIMNQF5bXNZqddn4S08'),
        )
        "
      `)
  })

  // Editors count \n, \r\n, a lone \r, U+2028 and U+2029 as line
  // terminators, so diagnostic locations must count every one.
  test.each([
    ['\\n', '\n'],
    ['\\r\\n', '\r\n'],
    ['a lone \\r', '\r'],
    ['U+2028', '\u2028'],
    ['U+2029', '\u2029'],
  ])(
    'reports the location of a diagnostic with %s line endings',
    async (_name, eol) => {
      const error = await compile({
        code: [
          `import { createServerFn } from '@tanstack/react-start'`,
          `export const { fn } = createServerFn().handler(async () => 1)`,
        ].join(eol),
        env: 'client',
        isProviderFile: false,
        mode: 'build',
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      expect(stripVTControlCharacters((error as Error).message)).toMatch(
        /> 2 \| export const \{ fn \} = createServerFn\(\)/,
      )
    },
  )

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
      mode: 'build',
    })

    // Server caller (route file - no split param)
    // Should NOT have the second argument since implementation comes from extracted chunk
    const compiledResultServerCaller = await compile({
      code,
      env: 'server',
      isProviderFile: false,
      mode: 'build',
    })

    // Server provider (extracted file - has split param)
    // Should HAVE the second argument since this is the implementation file
    const compiledResultServerProvider = await compile({
      code,
      env: 'server',
      isProviderFile: true,
      mode: 'build',
    })

    expect(await formatSnapshot(compiledResultClient!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
        "import { createClientRpc } from '@tanstack/react-start/client-rpc'
        import { createServerFn } from '@tanstack/react-start'
        const myServerFn = createServerFn().handler(
          createClientRpc('WYpJIMNQF5bXNZqddn4S08'),
        )
        "
      `)

    // Server caller: no second argument (implementation from extracted chunk)
    expect(await formatSnapshot(compiledResultServerCaller!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
        "import { createSsrRpc } from '@tanstack/react-start/ssr-rpc'
        import { createServerFn } from '@tanstack/react-start'
        const myServerFn = createServerFn().handler(
          createSsrRpc('WYpJIMNQF5bXNZqddn4S08'),
        )
        "
      `)

    // Server provider: has second argument (this is the implementation file)
    expect(await formatSnapshot(compiledResultServerProvider!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
        "import { createServerRpc } from '@tanstack/react-start/server-rpc'
        import { createServerFn } from '@tanstack/react-start'
        const myFunc = () => {
          return 'hello from the server'
        }
        const myServerFn_createServerFn_handler = createServerRpc(
          { id: 'WYpJIMNQF5bXNZqddn4S08', name: 'myServerFn', filename: 'src/test.ts' },
          (opts) => myServerFn.__executeServer(opts),
        )
        const myServerFn = createServerFn().handler(
          myServerFn_createServerFn_handler,
          myFunc,
        )
        export { myServerFn_createServerFn_handler }
        "
      `)
  })

  test('should remove imports used only as caller handler identifiers', async () => {
    const code = `
      import { createServerFn } from '@tanstack/react-start'
      import { getUsers } from './server'

      export const getUsersFn = createServerFn().handler(getUsers)
    `

    const compiledResult = await compile({
      code,
      env: 'client',
      isProviderFile: false,
      mode: 'build',
    })

    expect(await formatSnapshot(compiledResult!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
        "import { createClientRpc } from '@tanstack/react-start/client-rpc'
        import { createServerFn } from '@tanstack/react-start'
        export const getUsersFn = createServerFn().handler(
          createClientRpc('hUsF8j58VORzR8Zh0TWYHu'),
        )
        "
      `)
  })

  test('should not remove handler identifier bindings that are still referenced', async () => {
    const code = `
      import { createServerFn } from '@tanstack/react-start'
      import { getUsers } from './server'

      export const getUsersFn = createServerFn().handler(getUsers)
      console.log(getUsers)
    `

    const compiledResult = await compile({
      code,
      env: 'client',
      isProviderFile: false,
      mode: 'build',
    })

    expect(await formatSnapshot(compiledResult!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
        "import { createClientRpc } from '@tanstack/react-start/client-rpc'
        import { createServerFn } from '@tanstack/react-start'
        import { getUsers } from './server'
        export const getUsersFn = createServerFn().handler(
          createClientRpc('hUsF8j58VORzR8Zh0TWYHu'),
        )
        console.log(getUsers)
        "
      `)
  })

  test('should compile server functions wrapped in TypeScript as expressions', async () => {
    const code = `
      import { createServerFn } from '@tanstack/react-start'

      export const getUsersFn = createServerFn().handler(() => 'server') as any
    `

    const compiledResult = await compile({
      code,
      env: 'client',
      isProviderFile: false,
      mode: 'build',
    })

    expect(compiledResult).not.toBeNull()
    expect(compiledResult!.code).toContain('createClientRpc')
    expect(compiledResult!.code).not.toContain('server')
  })

  test('should compile server functions wrapped in TypeScript satisfies expressions', async () => {
    const code = `
      import { createServerFn } from '@tanstack/react-start'

      export const getUsersFn = createServerFn().handler(() => 'server') satisfies unknown
    `

    const compiledResult = await compile({
      code,
      env: 'client',
      isProviderFile: false,
      mode: 'build',
    })

    expect(compiledResult).not.toBeNull()
    expect(compiledResult!.code).toContain('createClientRpc')
    expect(compiledResult!.code).not.toContain('server')
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
      mode: 'build',
    })

    expect(await formatSnapshot(compiledResult!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
        "import { createClientRpc } from '@tanstack/react-start/client-rpc'
        import { createServerFn } from '@tanstack/react-start'
        export const exportedFn = createServerFn().handler(
          createClientRpc('2tiakNpA4QDPhHt7gcEQxW'),
        )
        const nonExportedFn = createServerFn().handler(
          createClientRpc('p5iUR0EOmj-YLvWU2l_Tw6'),
        )
        "
      `)

    // Server caller (route file) - no second argument
    const compiledResultServerCaller = await compile({
      code,
      env: 'server',
      isProviderFile: false,
      mode: 'build',
    })

    expect(await formatSnapshot(compiledResultServerCaller!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
        "import { createSsrRpc } from '@tanstack/react-start/ssr-rpc'
        import { createServerFn } from '@tanstack/react-start'
        export const exportedFn = createServerFn().handler(
          createSsrRpc('2tiakNpA4QDPhHt7gcEQxW'),
        )
        const nonExportedFn = createServerFn().handler(
          createSsrRpc('p5iUR0EOmj-YLvWU2l_Tw6'),
        )
        "
      `)

    // Server provider (extracted file) - has second argument
    const compiledResultServerProvider = await compile({
      code,
      env: 'server',
      isProviderFile: true,
      mode: 'build',
    })

    expect(await formatSnapshot(compiledResultServerProvider!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
        "import { createServerRpc } from '@tanstack/react-start/server-rpc'
        import { createServerFn } from '@tanstack/react-start'
        const exportedVar = 'exported'
        const exportedFn_createServerFn_handler = createServerRpc(
          { id: '2tiakNpA4QDPhHt7gcEQxW', name: 'exportedFn', filename: 'src/test.ts' },
          (opts) => exportedFn.__executeServer(opts),
        )
        const exportedFn = createServerFn().handler(
          exportedFn_createServerFn_handler,
          async () => {
            return exportedVar
          },
        )
        const nonExportedVar = 'non-exported'
        const nonExportedFn_createServerFn_handler = createServerRpc(
          {
            id: 'p5iUR0EOmj-YLvWU2l_Tw6',
            name: 'nonExportedFn',
            filename: 'src/test.ts',
          },
          (opts) => nonExportedFn.__executeServer(opts),
        )
        const nonExportedFn = createServerFn().handler(
          nonExportedFn_createServerFn_handler,
          async () => {
            return nonExportedVar
          },
        )
        export {
          exportedFn_createServerFn_handler,
          nonExportedFn_createServerFn_handler,
        }
        "
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
      getKnownServerFns: () => ({}),
      resolveId: resolveIdMock,
      mode: 'build',
    })

    await compiler.compile({
      code,
      id: '/test/src/test.ts',
    })

    // Direct known-library imports use the knownRootImports fast path, so they
    // do not need resolveId.
    expect(resolveIdMock).not.toHaveBeenCalled()
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
      getKnownServerFns: () => ({}),
      resolveId: resolveIdMock,
      mode: 'build',
    })

    await compiler.compile({
      code: factoryCode,
      id: '/test/src/test.ts',
    })

    // resolveId should only be called for './factory'. Direct known-library
    // imports use the knownRootImports fast path.
    //
    // Note: The factory module's import from '@tanstack/react-start' ALSO uses
    // the fast path (knownRootImports), so no additional resolveId call is needed there.
    expect(resolveIdMock).toHaveBeenCalledTimes(1)
    expect(resolveIdMock).toHaveBeenNthCalledWith(
      1,
      './factory',
      '/test/src/test.ts',
    )
  })

  test('keeps query-bearing virtual module identities distinct', async () => {
    const publicFactoryId = '\0virtual:server-fn-factory?variant=public'
    const implementationFactoryId =
      '\0virtual:server-fn-factory?variant=implementation'
    const virtualModules: Record<string, string> = {
      [publicFactoryId]: `
        import { createIssueServerFn } from 'virtual:server-fn-factory?variant=implementation'
        export { createIssueServerFn }
      `,
      [implementationFactoryId]: `
        import { createServerFn } from '@tanstack/react-start'
        export const createIssueServerFn = createServerFn
      `,
    }
    const loadedIds: Array<string> = []

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      mode: 'build',
      loadModule: async (id) => {
        loadedIds.push(id)
        const code = virtualModules[id]
        if (code) {
          compiler.ingestModule({ code, id })
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
      getKnownServerFns: () => ({}),
      resolveId: async (source) => {
        if (source.startsWith('virtual:server-fn-factory?')) {
          return `\0${source}`
        }

        return null
      },
    })

    const result = await compiler.compile({
      id: '/test/src/test.ts',
      code: `
        import { createIssueServerFn } from 'virtual:server-fn-factory?variant=public'
        const issueServerFn = createIssueServerFn().handler(async () => 'ok')
      `,
    })

    expect(result).not.toBeNull()
    expect(result!.code).toContain('createClientRpc')
    expect(loadedIds).toEqual([publicFactoryId, implementationFactoryId])
  })

  test('should resolve local named re-exports of createServerFn', async () => {
    const code = `
      import { createFooServerFn } from './factory'
      const myServerFn = createFooServerFn().handler(async () => {
        return 'hello'
      })`

    const resolveIdMock = vi.fn(async (id: string) => id)

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      loadModule: async (id) => {
        if (id === './factory') {
          compiler.ingestModule({
            code: `
              export { createServerFn as createFooServerFn } from '@tanstack/react-start'
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
      getKnownServerFns: () => ({}),
      resolveId: resolveIdMock,
      mode: 'build',
    })

    const result = await compiler.compile({
      code,
      id: '/test/src/test.ts',
    })

    expect(result).not.toBeNull()
    expect(result!.code).toContain('createClientRpc')
    expect(resolveIdMock).toHaveBeenCalledTimes(1)
    expect(resolveIdMock).toHaveBeenNthCalledWith(
      1,
      './factory',
      '/test/src/test.ts',
    )
  })

  test('should resolve export-star re-export chains of createServerFn', async () => {
    const code = `
      import { createFooServerFn } from './factory'
      const myServerFn = createFooServerFn().handler(async () => {
        return 'hello'
      })`

    const resolveIdMock = vi.fn(async (id: string) => id)

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      loadModule: async (id) => {
        if (id === './factory') {
          compiler.ingestModule({
            code: `
              export * from './factory-inner'
            `,
            id: './factory',
          })
        }

        if (id === './factory-inner') {
          compiler.ingestModule({
            code: `
              export { createServerFn as createFooServerFn } from '@tanstack/react-start'
            `,
            id: './factory-inner',
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
      getKnownServerFns: () => ({}),
      resolveId: resolveIdMock,
      mode: 'build',
    })

    const result = await compiler.compile({
      code,
      id: '/test/src/test.ts',
    })

    expect(result).not.toBeNull()
    expect(result!.code).toContain('createClientRpc')
    expect(resolveIdMock).toHaveBeenCalledTimes(2)
    expect(resolveIdMock).toHaveBeenNthCalledWith(
      1,
      './factory',
      '/test/src/test.ts',
    )
    expect(resolveIdMock).toHaveBeenNthCalledWith(
      2,
      './factory-inner',
      './factory',
    )
  })

  function createBuildCompiler(
    generateFunctionId: (opts: {
      filename: string
      functionName: string
    }) => string | undefined,
  ) {
    return new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      mode: 'build',
      loadModule: async () => {},
      lookupKinds: new Set(['ServerFn']),
      lookupConfigurations: [
        {
          libName: '@tanstack/react-start',
          rootExport: 'createServerFn',
          kind: 'Root',
        },
      ],
      resolveId: async (id) => id,
      generateFunctionId,
      getKnownServerFns: () => ({}),
    })
  }

  test('passes the handler name to generateFunctionId and defaults to short ids of the file and variable name', async () => {
    const generateFunctionId = vi.fn(() => undefined)
    const compiler = createBuildCompiler(generateFunctionId)

    const result = await compiler.compile({
      code: `
        import { createServerFn } from '@tanstack/react-start'
        export const getUser = createServerFn().handler(async () => 'user')
        var twice = createServerFn().handler(async () => 'a')
        var twice = createServerFn().handler(async () => 'b')
        export const getÜser = createServerFn().handler(async () => 'ü')
      `,
      id: '/test/src/users.ts',
    })

    expect(generateFunctionId.mock.calls).toEqual([
      [
        {
          filename: 'src/users.ts',
          functionName: 'getUser_createServerFn_handler',
        },
      ],
      [
        {
          filename: 'src/users.ts',
          functionName: 'twice_createServerFn_handler',
        },
      ],
      [
        {
          filename: 'src/users.ts',
          functionName: 'twice_createServerFn_handler_1',
        },
      ],
      [
        {
          filename: 'src/users.ts',
          functionName: 'get_ser_createServerFn_handler',
        },
      ],
    ])
    // base64url of sha256("src/users.ts#getUser"), "…#twice", "…#twice#1",
    // "…#getÜser", first 22 characters
    expect(
      [...result!.code.matchAll(/createClientRpc\("([^"]+)"/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      '5khyYluQNdT_FnYJdeNjO7',
      '86c3ovB8BBp6j3lZ7Ys3-q',
      'VDV9uQu-DjlBpN8wR9Hg81',
      'fR2z51S12hblu5q1t0xfsF',
    ])
  })

  test('a repeated name loses its leading and doubled underscores in the generator input', async () => {
    const generateFunctionId = vi.fn(
      (_opts: { filename: string; functionName: string }) => undefined,
    )
    const compiler = createBuildCompiler(generateFunctionId)

    await compiler.compile({
      code: `
        import { createServerFn } from '@tanstack/react-start'
        var _x = createServerFn().handler(async () => 'a')
        var _x = createServerFn().handler(async () => 'b')
        export const café = createServerFn().handler(async () => 'c')
        export const caf_ = createServerFn().handler(async () => 'd')
      `,
      id: '/test/src/users.ts',
    })

    expect(
      generateFunctionId.mock.calls.map(([opts]) => opts.functionName),
    ).toEqual([
      '_x_createServerFn_handler',
      'x_createServerFn_handler_1',
      'caf__createServerFn_handler',
      'caf_createServerFn_handler_1',
    ])
  })

  test.each([
    'users/get',
    'users#get',
    'users get',
    'utilisateurs-é',
    '..',
    '',
  ])(
    'fails on a custom id that is not one URL path segment: %j',
    async (id) => {
      const compiler = createBuildCompiler(() => id)

      await expect(
        compiler.compile({
          code: `
            import { createServerFn } from '@tanstack/react-start'
            export const getUser = createServerFn().handler(async () => 'user')
          `,
          id: '/test/src/users.ts',
        }),
      ).rejects.toThrow(
        `serverFns.generateFunctionId returned ${JSON.stringify(id)} for the server function getUser (functionName "getUser_createServerFn_handler") of src/users.ts`,
      )
    },
  )

  test('accepts a custom id of unreserved characters and $', async () => {
    const compiler = createBuildCompiler(() => 'Users-get.v1_~$')

    const result = await compiler.compile({
      code: `
        import { createServerFn } from '@tanstack/react-start'
        export const getUser = createServerFn().handler(async () => 'user')
      `,
      id: '/test/src/users.ts',
    })

    expect(result!.code).toContain('createClientRpc("Users-get.v1_~$"')
  })

  test('reuses deduped custom IDs across compiler instances', async () => {
    const serverFnsById: Record<
      string,
      {
        functionName: string
        functionId: string
        extractedFilename: string
        filename: string
        isClientReferenced?: boolean
      }
    > = {}

    function createCompiler() {
      return new StartCompiler({
        env: 'server',
        ...getDefaultTestOptions('server'),
        mode: 'build',
        loadModule: async () => {},
        lookupKinds: new Set(['ServerFn']),
        lookupConfigurations: [
          {
            libName: '@tanstack/react-start',
            rootExport: 'createServerFn',
            kind: 'Root',
          },
        ],
        resolveId: async (id) => id,
        generateFunctionId: ({ functionName }) =>
          functionName === 'greetUser_createServerFn_handler'
            ? 'constant_id'
            : undefined,
        getKnownServerFns: () => serverFnsById,
        onServerFnsById: (discovered) => {
          Object.assign(serverFnsById, discovered)
        },
      })
    }

    const firstCompiler = createCompiler()
    await firstCompiler.compile({
      code: `
        import { createServerFn } from '@tanstack/react-start'
        export const greetUser = createServerFn().handler(async () => 'first')
      `,
      id: '/test/src/submit-post-formdata.tsx',
    })

    await firstCompiler.compile({
      code: `
        import { createServerFn } from '@tanstack/react-start'
        export const greetUser = createServerFn().handler(async () => 'second')
      `,
      id: '/test/src/formdata-redirect/index.tsx',
    })

    expect(
      Object.values(serverFnsById)
        .map((serverFn) => serverFn.functionId)
        .sort(),
    ).toEqual(['constant_id', 'constant_id_1'])

    const secondCompiler = createCompiler()
    const firstResult = await secondCompiler.compile({
      code: `
        import { createServerFn } from '@tanstack/react-start'
        export const greetUser = createServerFn().handler(async () => 'first')
      `,
      id: '/test/src/submit-post-formdata.tsx',
    })

    const secondResult = await secondCompiler.compile({
      code: `
        import { createServerFn } from '@tanstack/react-start'
        export const greetUser = createServerFn().handler(async () => 'second')
      `,
      id: '/test/src/formdata-redirect/index.tsx',
    })

    expect(firstResult!.code).toContain('createSsrRpc("constant_id"')
    expect(secondResult!.code).toContain('createSsrRpc("constant_id_1"')
  })

  test('should resolve createServerFn from the same binding as a known root export', async () => {
    const virtualModules: Record<string, string> = {
      '@tanstack/start-client-core': `
        export { createServerFn } from './createServerFn'
      `,
      '/virtual/compiler-known/server-fn-factory.ts': `
        export const createServerFn = () => ({
          handler: () => createServerFn(),
        })
      `,
    }

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      root: '/test',
      mode: 'build',
      loadModule: async (id) => {
        const code = virtualModules[id]
        if (code) {
          compiler.ingestModule({ code, id })
        }
      },
      lookupKinds: new Set(['ServerFn']),
      lookupConfigurations: [],
      getKnownServerFns: () => ({}),
      resolveId: async (source) => {
        if (source === '@tanstack/start-client-core') {
          return '@tanstack/start-client-core'
        }

        if (source === './createServerFn') {
          return '/virtual/compiler-known/server-fn-factory.ts'
        }

        return null
      },
    })

    const result = await compiler.compile({
      id: '/test/src/internal-server-fn.ts',
      code: `
        import { createServerFn } from './createServerFn'

        export const getMessage = createServerFn().handler(() => {
          return 'server-only-value'
        })
      `,
    })

    expect(result).not.toBeNull()
    expect(result!.code).toContain('createClientRpc')
    expect(result!.code).not.toContain('server-only-value')
  })
})
