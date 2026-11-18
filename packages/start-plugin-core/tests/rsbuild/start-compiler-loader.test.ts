import fs from 'node:fs'
import { SourceMapConsumer } from 'source-map'
import { describe, expect, test, vi } from 'vitest'
import loader from '../../src/rsbuild/start-compiler-loader'
import { registerStartCompilerTransforms } from '../../src/rsbuild/start-compiler-host'
import { SERVER_FN_BUILD_INFO_FIELD } from '../../src/rsbuild/start-compiler-metadata'
import type { StartCompilerHostOptions } from '../../src/rsbuild/start-compiler-host'
import type { StartCompilerLoaderOptions } from '../../src/rsbuild/start-compiler-loader'
import type { ServerFnBuildInfo } from '../../src/rsbuild/start-compiler-metadata'
import type {
  ModifyBundlerChainFn,
  ModifyRspackConfigFn,
  RsbuildPluginAPI,
  Rspack,
} from '@rsbuild/core'

function invokeLoader(
  options: StartCompilerLoaderOptions,
  context: Rspack.LoaderContext,
  source: string,
  map?: Rspack.RawSourceMap,
  buildInfo: Record<string, unknown> = {},
) {
  return new Promise<{ code: string; map?: Rspack.RawSourceMap }>(
    (resolve, reject) => {
      Object.assign(context, {
        getOptions: () => options,
        _module: { buildInfo },
        async:
          () =>
          (
            error: Error | null,
            code: string,
            outputMap?: Rspack.RawSourceMap,
          ) => {
            if (error) {
              reject(error)
            } else {
              resolve({ code, map: outputMap })
            }
          },
      })
      void loader.call(
        context as Rspack.LoaderContext<StartCompilerLoaderOptions>,
        source,
        map,
      )
    },
  )
}

function runLoader(
  compile: StartCompilerLoaderOptions['compile'],
  map?: Rspack.RawSourceMap,
  buildInfo: Record<string, unknown> = {},
  codeFilters = [/./],
) {
  const result = invokeLoader(
    {
      env: 'client',
      envName: 'client',
      getRoot: () => '/src',
      compilerPlugins: [],
      codeFilters,
      compile,
    },
    createContext('/src/entry.ts?variant=client'),
    'input',
    map,
    buildInfo,
  )
  return { result, buildInfo }
}

describe('Start compiler loader', () => {
  test('returns transformed code and the metadata for the full resource', async () => {
    const metadata: ServerFnBuildInfo = { version: 1, serverFnsById: {} }
    const compile = vi.fn(async (context: Rspack.LoaderContext) => {
      expect(context.resource).toBe('/src/entry.ts?variant=client')
      return {
        result: { code: 'output' },
        serverFnsById: metadata.serverFnsById,
      }
    })
    const { result, buildInfo } = runLoader(compile)
    expect(await result).toEqual({ code: 'output', map: undefined })
    expect(buildInfo[SERVER_FN_BUILD_INFO_FIELD]).toEqual(metadata)
  })

  test('preserves an input map and clears metadata when compilation is skipped', async () => {
    const map: Rspack.RawSourceMap = {
      version: 3,
      file: 'intermediate.ts',
      sources: ['original.ts'],
      names: [],
      mappings: 'AAAA',
    }
    const { result, buildInfo } = runLoader(
      async () => {
        throw new Error('filtered module must not compile')
      },
      map,
      {
        [SERVER_FN_BUILD_INFO_FIELD]: {
          version: 1,
          serverFnsById: {
            old: {
              functionId: 'old',
              functionName: 'old',
              filename: '/src/entry.ts',
              extractedFilename: '/src/entry.ts?serverFn',
            },
          },
        },
      },
      [],
    )
    expect(await result).toEqual({ code: 'input', map })
    expect(buildInfo[SERVER_FN_BUILD_INFO_FIELD]).toEqual({
      version: 1,
      serverFnsById: {},
    })
  })

  test('composes the compiler map with a preceding loader map', async () => {
    const original: Rspack.RawSourceMap = {
      version: 3,
      file: 'intermediate.ts',
      sources: ['original.ts'],
      sourcesContent: ['\n\noriginal'],
      names: [],
      mappings: 'AAEA',
    }
    const generated: Rspack.RawSourceMap = {
      version: 3,
      file: 'output.js',
      sources: ['intermediate.ts'],
      names: [],
      mappings: ';AAAA',
    }
    const { result } = runLoader(
      async () => ({
        result: { code: '\noutput', map: generated },
        serverFnsById: {},
      }),
      original,
    )
    const output = await result
    await SourceMapConsumer.with(output.map!, null, (consumer) => {
      expect(consumer.originalPositionFor({ line: 2, column: 0 })).toEqual({
        source: 'original.ts',
        line: 3,
        column: 0,
        name: null,
      })
      expect(consumer.sourceContentFor('original.ts')).toBe('\n\noriginal')
    })
  })

  test('propagates compilation failures to the bundler', async () => {
    const { result, buildInfo } = runLoader(async () => {
      throw new Error('compile failed')
    })
    await expect(result).rejects.toThrow('compile failed')
    expect(buildInfo).toEqual({})
  })
})

function createEnvironment(
  overrides: Partial<StartCompilerHostOptions> & {
    inputFileSystem?: Rspack.Compiler['inputFileSystem']
  } = {},
) {
  const { inputFileSystem = fs, ...hostOptions } = overrides
  const environment = hostOptions.environments?.[0] ?? {
    name: 'client',
    type: 'client',
  }
  let options: StartCompilerLoaderOptions
  let watchRun: (compiler: Rspack.Compiler) => void
  const use = {
    loader: () => use,
    options: (value: StartCompilerLoaderOptions) => {
      options = value
    },
  }
  const rule = {
    test: () => rule,
    enforce: () => rule,
    use: () => use,
  }
  const config = { plugins: [] as Array<Rspack.RspackPluginInstance> }
  registerStartCompilerTransforms(
    {
      context: { action: 'build' },
      modifyBundlerChain: (handler: ModifyBundlerChainFn) => {
        handler(
          { module: { rule: () => rule } } as unknown as Parameters<
            typeof handler
          >[0],
          { environment } as unknown as Parameters<typeof handler>[1],
        )
      },
      modifyRspackConfig: (handler: ModifyRspackConfigFn) => {
        handler(
          config as Parameters<typeof handler>[0],
          { environment } as unknown as Parameters<typeof handler>[1],
        )
      },
    } as RsbuildPluginAPI,
    {
      framework: 'react',
      root: '/src',
      environments: [environment],
      providerEnvName: 'ssr',
      ...hostOptions,
    },
  )
  const compiler = {
    inputFileSystem,
    hooks: {
      finishMake: { tap: vi.fn() },
      watchRun: {
        tap: (_name: string, callback: typeof watchRun) => {
          watchRun = callback
        },
      },
    },
  } as unknown as Rspack.Compiler
  for (const plugin of config.plugins) {
    plugin.apply(compiler)
  }
  return {
    async transformModule(context: Rspack.LoaderContext, source: string) {
      const buildInfo: Record<string, unknown> = {}
      const result = await invokeLoader(
        options,
        context,
        source,
        undefined,
        buildInfo,
      )
      const metadata = buildInfo[SERVER_FN_BUILD_INFO_FIELD] as
        | ServerFnBuildInfo
        | undefined
      return { ...result, serverFnsById: metadata?.serverFnsById ?? null }
    },
    invalidateModule(file: string) {
      compiler.modifiedFiles = new Set([file])
      watchRun(compiler)
    },
  }
}

function createContext(resource: string) {
  return {
    resource,
    emitWarning: vi.fn(),
    addDependency: vi.fn(),
    resolve: (
      _context: string,
      request: string,
      callback: (error: Error | null, result: string) => void,
    ) => {
      // Allow other loader calls to enter while compiler initialization resolves imports.
      queueMicrotask(() => callback(null, request))
    },
  } as unknown as Rspack.LoaderContext
}

const serverFnSource = (name: string) => `
  import { createServerFn } from '@tanstack/react-start'
  export const ${name} = createServerFn().handler(() => '${name}')
`

describe('Start compiler host environment', () => {
  test('runs plugin-only transforms without any Start lookup kinds', async () => {
    const environment = createEnvironment({
      compilerPlugins: [
        {
          name: 'plugin-only',
          detect: /pluginOnly/,
          transformAst: ({ ast, types }) => {
            ast.program.body.push(
              types.exportNamedDeclaration(
                types.variableDeclaration('const', [
                  types.variableDeclarator(
                    types.identifier('transformed'),
                    types.booleanLiteral(true),
                  ),
                ]),
              ),
            )
            return true
          },
        },
      ],
    })
    const result = await environment.transformModule(
      createContext('/src/plugin.ts'),
      'export const pluginOnly = true',
    )
    expect(result.code).toContain('export const transformed = true')
    expect(result.serverFnsById).toEqual({})
  })

  test('isolates metadata for concurrent modules in the same environment', async () => {
    const environment = createEnvironment()
    const results = await Promise.all(
      ['first', 'second'].map((name) =>
        environment.transformModule(
          createContext(`/src/${name}.ts?variant=caller`),
          serverFnSource(name),
        ),
      ),
    )
    for (const [i, name] of ['first', 'second'].entries()) {
      const functions = Object.values(results[i]!.serverFnsById!)
      expect(functions).toHaveLength(1)
      expect(functions[0]!.filename).toBe(`/src/${name}.ts`)
      expect(results[i]!.code).toContain('createClientRpc')
    }
  })

  test('keeps client and server compiler state separate', async () => {
    const client = createEnvironment()
    const server = createEnvironment({
      environments: [{ name: 'ssr', type: 'server' }],
    })
    const compileShared = (environment: typeof client) =>
      environment.transformModule(
        createContext('/src/shared.ts'),
        serverFnSource('shared'),
      )
    const [clientResult, serverResult] = await Promise.all([
      compileShared(client),
      compileShared(server),
    ])
    expect(clientResult.code).toContain('createClientRpc')
    expect(serverResult.code).toContain('createSsrRpc')
    expect(Object.values(clientResult.serverFnsById!)).toHaveLength(1)
    expect(Object.values(serverResult.serverFnsById!)).toHaveLength(1)
  })

  test('keeps dependency tracking on the requesting context across queued modules', async () => {
    const environment = createEnvironment({
      inputFileSystem: {
        readFile: (
          _file: string,
          callback: (error: null, data: Buffer) => void,
        ) => {
          queueMicrotask(() =>
            callback(
              null,
              Buffer.from(
                "export { createServerFn } from '@tanstack/react-start'",
              ),
            ),
          )
        },
      } as unknown as Rspack.Compiler['inputFileSystem'],
    })
    const contexts = ['first', 'second'].map((name) => {
      const context = createContext(`/src/${name}/entry.ts`)
      context.resolve = (directory, request, callback) => {
        queueMicrotask(() =>
          callback(
            null,
            request === './factory' ? `${directory}/factory.ts` : request,
          ),
        )
      }
      return context
    })
    const results = await Promise.all(
      contexts.map((context, index) =>
        environment.transformModule(
          context,
          serverFnSource(`fn${index}`).replace(
            '@tanstack/react-start',
            './factory',
          ),
        ),
      ),
    )
    for (const [index, name] of ['first', 'second'].entries()) {
      const sourceDependencies = vi
        .mocked(contexts[index]!.addDependency)
        .mock.calls.map(([file]) => file)
        .filter((file) => file.startsWith('/src/'))
      expect(sourceDependencies).toEqual([`/src/${name}/factory.ts`])
      expect(
        Object.values(results[index]!.serverFnsById!).map((fn) => fn.filename),
      ).toEqual([`/src/${name}/entry.ts`])
      expect(results[index]!.code).toContain('createClientRpc')
    }
  })

  test('continues queued work after a compilation fails', async () => {
    const environment = createEnvironment()
    const results = await Promise.allSettled([
      environment.transformModule(
        createContext('/src/broken.ts'),
        'createServerFn( ',
      ),
      environment.transformModule(
        createContext('/src/valid.ts'),
        serverFnSource('valid'),
      ),
    ])
    expect(results[0]!.status).toBe('rejected')
    expect(results[1]!.status).toBe('fulfilled')
    if (results[1]!.status === 'fulfilled') {
      expect(
        Object.values(results[1].value.serverFnsById!).map((fn) => fn.filename),
      ).toEqual(['/src/valid.ts'])
    }
  })

  test('filters virtual output and retains its map without resolving compiler imports', async () => {
    const map: Rspack.RawSourceMap = {
      version: 3,
      file: 'virtual.js',
      sources: ['virtual.ts'],
      names: [],
      mappings: 'AAAA',
    }
    const loadVirtualModule = vi.fn(() => ({
      code: 'export const answer = 42',
      map,
    }))
    const environment = createEnvironment({
      root: () => '/project',
      compilerPlugins: [
        {
          name: 'virtual',
          virtualModuleIdPattern: /virtual/,
          loadVirtualModule,
        },
      ],
    })
    const context = createContext('/src/virtual.ts?query')
    context.resolve = vi.fn(() => {
      throw new Error('filtered module must not resolve compiler imports')
    })
    expect(await environment.transformModule(context, 'placeholder')).toEqual({
      code: 'export const answer = 42',
      map,
      serverFnsById: null,
    })
    expect(loadVirtualModule).toHaveBeenCalledWith({
      code: 'placeholder',
      id: '/src/virtual.ts?query',
      root: '/project',
      env: 'client',
      envName: 'client',
    })
    expect(context.resolve).not.toHaveBeenCalled()
  })

  test('compiles Start patterns introduced by a virtual module', async () => {
    const environment = createEnvironment({
      compilerPlugins: [
        {
          name: 'virtual',
          virtualModuleIdPattern: /virtual/,
          loadVirtualModule: () => ({ code: serverFnSource('virtualFn') }),
        },
      ],
    })
    const result = await environment.transformModule(
      createContext('/src/virtual.ts'),
      'placeholder',
    )
    expect(result.code).toContain('createClientRpc')
    expect(Object.values(result.serverFnsById!)).toHaveLength(1)
  })

  test('retains virtual code and map when a matching plugin makes no changes', async () => {
    const map: Rspack.RawSourceMap = {
      version: 3,
      file: 'virtual.js',
      sources: ['original.ts'],
      names: [],
      mappings: 'AAAA',
    }
    const transformAst = vi.fn(() => false)
    const environment = createEnvironment({
      compilerPlugins: [
        {
          name: 'virtual-no-op',
          virtualModuleIdPattern: /virtual/,
          detect: /pluginOnly/,
          loadVirtualModule: () => ({
            code: 'export const pluginOnly = true',
            map,
          }),
          transformAst,
        },
      ],
    })
    const result = await environment.transformModule(
      createContext('/src/virtual.ts?query'),
      'placeholder',
    )
    expect(transformAst).toHaveBeenCalledOnce()
    expect(result).toEqual({
      code: 'export const pluginOnly = true',
      map,
      serverFnsById: {},
    })
  })

  test('tracks compiler dependencies and reloads them after invalidation', async () => {
    let dependency = "export { createServerFn } from '@tanstack/react-start'"
    const readFile = vi.fn(
      (_file: string, callback: (error: null, data: Buffer) => void) => {
        queueMicrotask(() => callback(null, Buffer.from(dependency)))
      },
    )
    const environment = createEnvironment({
      inputFileSystem: {
        readFile,
      } as unknown as Rspack.Compiler['inputFileSystem'],
    })
    const context = createContext('/src/consumer.ts')
    context.resolve = (_directory, request, callback) => {
      queueMicrotask(() =>
        callback(null, request === './factory' ? '/src/factory.ts' : request),
      )
    }
    const source = serverFnSource('fromFactory').replace(
      '@tanstack/react-start',
      './factory',
    )
    const first = await environment.transformModule(context, source)
    expect(first.code).toContain('createClientRpc')
    expect(Object.values(first.serverFnsById!)).toHaveLength(1)
    expect(context.addDependency).toHaveBeenCalledWith('/src/factory.ts')
    expect(readFile).toHaveBeenCalledWith(
      '/src/factory.ts',
      expect.any(Function),
    )

    dependency =
      'export function createServerFn() { return { handler: (fn) => fn } }'
    readFile.mockClear()
    environment.invalidateModule('/src/factory.ts')
    const second = await environment.transformModule(context, source)
    expect(second.code).toBe(source)
    expect(second.serverFnsById!).toEqual({})
    expect(readFile).toHaveBeenCalledWith(
      '/src/factory.ts',
      expect.any(Function),
    )
  })
})
