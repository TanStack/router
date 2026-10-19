import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { createStartCompiler as createHostCompiler } from '../src/start-compiler/host'
import {
  callerRpcId,
  callProvider,
  clientOnlyError,
  compileCode,
  compileFor,
  compileServer,
  createStartCompiler,
  directivePrologue,
  evaluateModule,
  renderThingTransform,
  serverOnlyError,
  settle,
  settleAsync,
} from './regression-helpers'
import type { StartCompilerImportTransform } from '../src/types'

/** A Start factory left uncompiled: calling it fails the test. */
const uncompiled = () => {
  throw new Error('uncompiled Start factory')
}

describe('compiler handles multiple files with different kinds', () => {
  test('single compiler instance correctly processes files with different kinds in succession', async () => {
    const { compile } = createStartCompiler({ env: 'client' })
    const evaluate = async (code: string, id: string) =>
      evaluateModule((await compile(code, id))!)

    // File 1: ServerFn only
    const file1 = await evaluate(
      `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(() => 'hello')`,
      '/test/src/file1.ts',
    )
    expect(callerRpcId(file1.fn)).toEqual(expect.any(String))

    // File 2: Middleware only. The client middleware keeps no `.server()`.
    const file2 = await evaluate(
      `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware().server(({ next }) => {
  console.log('server only')
  return next()
})`,
      '/test/src/file2.ts',
    )
    expect(file2.mw.options.server).toBeUndefined()

    // File 3: IsomorphicFn only
    const file3 = await evaluate(
      `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = createIsomorphicFn()
  .client(() => 'client-value')
  .server(() => 'server-value')`,
      '/test/src/file3.ts',
    )
    expect(file3.fn()).toBe('client-value')

    // File 4: ServerOnlyFn only
    const file4 = await evaluate(
      `import { createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerOnlyFn(() => 'server only value')`,
      '/test/src/file4.ts',
    )
    expect(settle(file4.fn)).toEqual(serverOnlyError)

    // File 5: Mix of ServerFn and IsomorphicFn
    const file5 = await evaluate(
      `import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'
export const serverFn = createServerFn().handler(() => 'hello')
export const isoFn = createIsomorphicFn().client(() => 'client-iso')`,
      '/test/src/file5.ts',
    )
    expect(callerRpcId(file5.serverFn)).toEqual(expect.any(String))
    expect(file5.isoFn()).toBe('client-iso')
  })

  test('compiler works correctly when processing same kind multiple times', async () => {
    const { compile } = createStartCompiler({ env: 'client' })
    const first = await evaluateModule(
      (await compile(
        `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn1 = createIsomorphicFn().client(() => 'first')`,
        '/test/src/first.ts',
      ))!,
    )
    const second = await evaluateModule(
      (await compile(
        `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn2 = createIsomorphicFn().client(() => 'second')`,
        '/test/src/second.ts',
      ))!,
    )
    expect(first.fn1()).toBe('first')
    expect(second.fn2()).toBe('second')
  })
})

test('a server fn module importing an empty module compiles', async () => {
  // In dev, `./empty` is a file the user just emptied (only whitespace
  // left). Resolving `base` (a builder in the shape of a server fn) loads
  // it.
  const { compile, serverFns } = createStartCompiler({
    env: 'client',
    mode: 'dev',
    files: { '/test/src/empty.ts': '   \n\t  ' },
  })

  const result =
    await compile(`import { createServerFn } from '@tanstack/react-start'
import { base } from './empty'
export const other = base.handler(async () => 'not a server fn')
export const fn = createServerFn().handler(async () => 'server-secret')`)

  expect(result).not.toBeNull()
  expect(result).not.toContain('server-secret')
  expect(Object.keys(serverFns)).toHaveLength(1)
})

describe('calling result of createServerOnlyFn/createClientOnlyFn', () => {
  // This tests the fix for https://github.com/TanStack/router/issues/6643
  // When a file has both createServerFn and createServerOnlyFn, and the result
  // of createServerOnlyFn is invoked (e.g., `const result = myServerOnlyFn()`),
  // the compiler should NOT treat that invocation as a ServerOnlyFn candidate.
  // The var binding holds the RESULT of the factory, not the factory itself.

  test('invocation of createServerOnlyFn result is not treated as a candidate', async () => {
    // Compiling must not throw "createServerOnlyFn() must be called with a
    // function!", and the handler reads the value the call returned.
    const server =
      await compileServer(`import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'

const createRandomNumber = createServerOnlyFn(() => Math.floor(Math.random() * 100))
const randomNumber = createRandomNumber()

export const personServerFn = createServerFn({ method: 'GET' })
  .handler(({ data: name }) => {
    return { name, randomNumber }
  })`)
    expect(await callProvider(server, 'personServerFn', {}, 'Ada')).toEqual({
      name: 'Ada',
      randomNumber: expect.any(Number),
    })
  })

  test('invocation of createClientOnlyFn result is not treated as a candidate', async () => {
    const { code, serverFns } = await compileFor(
      'client',
      `import { createClientOnlyFn, createServerFn } from '@tanstack/react-start'

const getWindowWidth = createClientOnlyFn(() => window.innerWidth)
export function readWidth() {
  const width = getWindowWidth()
  return width
}

export const personServerFn = createServerFn({ method: 'GET' })
  .handler(({ data: name }) => {
    return { name }
  })`,
    )
    vi.stubGlobal('window', { innerWidth: 42 })
    try {
      const client = await evaluateModule(code!)
      expect(client.readWidth()).toBe(42)
      expect(callerRpcId(client.personServerFn)).toBe(Object.keys(serverFns)[0])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('re-exported createServerOnlyFn still resolves correctly', async () => {
    // Ensure the fix doesn't break re-export chain resolution (issue #6583)
    const { compile } = createStartCompiler({
      env: 'client',
      files: {
        '@tanstack/start-client-core': `export { createServerOnlyFn } from '@tanstack/start-fn-stubs'`,
      },
    })

    const result =
      await compile(`import { createServerOnlyFn } from '@tanstack/start-client-core'
export const myFn = createServerOnlyFn(() => 'server-only-value')`)

    expect(result).not.toBeNull()
    expect(result).not.toContain('server-only-value')
    const { myFn } = await evaluateModule(result!, {
      '@tanstack/start-client-core': { createServerOnlyFn: uncompiled },
    })
    expect(settle(myFn)).toEqual(serverOnlyError)
  })

  test('aliased factory is still detected as a candidate', async () => {
    // `const createSO = createServerOnlyFn` is an alias, not an invocation.
    // `createSO(() => ...)` should still be treated as ServerOnlyFn.
    const result = await compileCode(
      'client',
      `import { createServerOnlyFn } from '@tanstack/react-start'

const createSO = createServerOnlyFn
export const myFn = createSO(() => 'aliased-server-only')`,
    )

    expect(result).not.toBeNull()
    expect(result).not.toContain('aliased-server-only')
    const { myFn } = await evaluateModule(result!)
    expect(settle(myFn)).toEqual(serverOnlyError)
  })
})

describe('re-export chain resolution', () => {
  // This tests the fix for https://github.com/TanStack/router/issues/6583
  // Third-party packages may import from @tanstack/start-client-core (which re-exports
  // from @tanstack/start-fn-stubs) rather than directly from @tanstack/react-start.
  // The compiler should correctly resolve these imports via the slow path.

  // Virtual module contents for simulating the re-export chain:
  // @third-party/lib -> @tanstack/start-client-core -> @tanstack/start-fn-stubs
  //
  // Note: We don't need a virtual module for @tanstack/start-fn-stubs because
  // init() hardcodes it in knownRootImports. When the slow path resolution reaches
  // that package, it uses the fast path lookup and never needs to parse the module.
  const virtualModules: Record<string, string> = {
    // The client-core package that re-exports from stubs
    '@tanstack/start-client-core': `
      export { createIsomorphicFn, createServerOnlyFn, createClientOnlyFn } from '@tanstack/start-fn-stubs'
    `,
    // A third-party package that imports from start-client-core
    '@third-party/lib': `
      import { createIsomorphicFn, createClientOnlyFn } from '@tanstack/start-client-core'

      export const getThemeData = createIsomorphicFn()
        .client(() => 'client-theme')
        .server(() => 'server-theme')

      export const initClientFeature = createClientOnlyFn(() => {
        console.log('client only initialization')
        return 'initialized'
      })
    `,
  }

  const testCases: Array<{
    env: 'client' | 'server'
    fn: string
    /** What the evaluated export returns, or the error it throws. */
    value: string
    /** Implementation code the output must not contain. */
    absent?: string
  }> = [
    {
      env: 'client',
      fn: 'createIsomorphicFn',
      value: 'client-theme',
      absent: 'server-theme',
    },
    {
      env: 'server',
      fn: 'createIsomorphicFn',
      value: 'server-theme',
      absent: 'client-theme',
    },
    {
      env: 'client',
      fn: 'createClientOnlyFn',
      value: 'initialized',
    },
    {
      env: 'server',
      fn: 'createClientOnlyFn',
      value: clientOnlyError,
      absent: 'client only initialization',
    },
  ]

  test.each(testCases)(
    'resolves $fn via re-export chain on $env',
    async ({ env, fn, value, absent }) => {
      const { compile } = createStartCompiler({
        env,
        files: {
          '@tanstack/start-client-core':
            virtualModules['@tanstack/start-client-core']!,
        },
      })
      const code = virtualModules['@third-party/lib']!

      const result = await compile(code, '@third-party/lib')

      expect(result).not.toBeNull()
      if (absent) {
        expect(result).not.toContain(absent)
      }
      const module = await evaluateModule(result!, {
        '@tanstack/start-client-core': {
          createIsomorphicFn: uncompiled,
          createClientOnlyFn: uncompiled,
        },
      })
      const exported =
        fn === 'createIsomorphicFn'
          ? module.getThemeData
          : module.initClientFeature
      expect(settle(exported)).toEqual(value)
    },
  )

  test('handles deeper re-export chains', async () => {
    // Another intermediate package between the library and the stubs.
    const { compile } = createStartCompiler({
      env: 'client',
      files: {
        '@tanstack/start-client-core':
          virtualModules['@tanstack/start-client-core']!,
        '@another-intermediate/pkg': `export { createIsomorphicFn } from '@tanstack/start-client-core'`,
      },
    })

    const result = await compile(
      `import { createIsomorphicFn } from '@another-intermediate/pkg'
export const deepFn = createIsomorphicFn()
  .client(() => 'deep-client')
  .server(() => 'deep-server')`,
      '@deep-third-party/lib',
    )

    expect(result).not.toBeNull()
    expect(result).not.toContain('deep-server')
    const { deepFn } = await evaluateModule(result!, {
      '@another-intermediate/pkg': { createIsomorphicFn: uncompiled },
    })
    expect(deepFn()).toBe('deep-client')
  })

  test.each([
    {
      name: 'named re-export cycle',
      virtualModules: {
        './factory-a': `
          export { createServerOnlyFn } from './factory-b'
        `,
        './factory-b': `
          export { createServerOnlyFn } from './factory-a'
        `,
      },
    },
    {
      name: 'import alias cycle',
      virtualModules: {
        './factory-a': `
          import { createServerOnlyFn } from './factory-b'
          export { createServerOnlyFn }
        `,
        './factory-b': `
          import { createServerOnlyFn } from './factory-a'
          export { createServerOnlyFn }
        `,
      },
    },
    {
      name: 'export-star cycle',
      virtualModules: {
        './factory-a': `
          export * from './factory-b'
        `,
        './factory-b': `
          export * from './factory-a'
        `,
      },
    },
  ])('handles circular import chain: $name', async ({ virtualModules }) => {
    // The cycle never reaches a Start factory (it cannot even link as ES
    // modules): compiling settles, with a result or an error, instead of
    // looping.
    const files = Object.fromEntries(
      Object.entries(virtualModules).map(([specifier, code]) => [
        `/test/src/${specifier.slice(2)}.ts`,
        code,
      ]),
    )
    const { compile } = createStartCompiler({ env: 'server', files })

    const settled = await Promise.race([
      compile(`import { createServerOnlyFn } from './factory-a'
export const myFn = createServerOnlyFn(() => 'server-only-value')`).then(
        () => 'settled',
        () => 'settled',
      ),
      new Promise((resolve) => setTimeout(resolve, 2_000, 'still compiling')),
    ])
    expect(settled).toBe('settled')
  })

  test('invalidateModule clears cached module resolution state', async () => {
    const files: Record<string, string> = {
      '/test/src/factory.ts': `export { createServerOnlyFn } from './factory-inner'`,
      '/test/src/factory-inner.ts': `export { createServerOnlyFn } from '@tanstack/start-fn-stubs'`,
    }
    const { compiler, compile } = createStartCompiler({
      env: 'server',
      mode: 'dev',
      files,
    })
    const source = `import { createServerOnlyFn } from './factory'
export const myFn = createServerOnlyFn(() => 'server-only-value')`
    const run = async () => {
      const { myFn } = await evaluateModule((await compile(source)) ?? source, {
        './factory': { createServerOnlyFn: uncompiled },
      })
      return settle(myFn)
    }

    expect(await run()).toBe('server-only-value')

    files['/test/src/factory-inner.ts'] =
      `export { createClientOnlyFn as createServerOnlyFn } from '@tanstack/start-fn-stubs'`
    compiler.invalidateModule('/test/src/factory-inner.ts')

    expect(await run()).toEqual(clientOnlyError)
  })

  // The source module only mentions createServerFn: the factory module
  // renames createServerOnlyFn, so the kind of the aliased call is only found
  // by resolving it.
  test('recompiles aliased env-only calls in a provider whose source only mentions createServerFn', async () => {
    const files: Record<string, string> = {
      '/test/src/factory.ts': `export { createServerOnlyFn as createServerFnHmrFactory } from '@tanstack/start-fn-stubs'`,
    }
    const id = '/test/src/aliased-env-only-server-fn.ts'
    const source = `import { createServerFn } from '@tanstack/react-start'
import { createServerFnHmrFactory } from './factory'

const serverOnlyImpl = createServerFnHmrFactory(() => 'server-only-value')

export const serverFn = createServerFn().handler(async () => {
  return serverOnlyImpl()
})`
    const { compiler, compile } = createStartCompiler({
      env: 'server',
      mode: 'dev',
      files,
    })
    const callServerFn = async () =>
      settleAsync(async () =>
        callProvider(
          {
            id,
            ssr: (await compile(source, id)) ?? source,
            provider: (await compile(source, `${id}?tss-serverfn-split`))!,
          },
          'serverFn',
          { './factory': { createServerFnHmrFactory: uncompiled } },
        ),
      )

    expect(await callServerFn()).toBe('server-only-value')

    files['/test/src/factory.ts'] =
      `export { createClientOnlyFn as createServerFnHmrFactory } from '@tanstack/start-fn-stubs'`
    compiler.invalidateModule('/test/src/factory.ts')

    expect(await callServerFn()).toEqual(clientOnlyError)
  })

  // The same with an external transform configured (e.g. the RSC CSS one).
  test('a provider with external transforms compiles aliased env-only calls of a server fn module', async () => {
    const files = {
      '/test/src/factory.ts': `export { createServerOnlyFn as makeServerOnly } from '@tanstack/start-fn-stubs'`,
    }
    const id = '/test/src/aliased.ts'
    const source = `import { createServerFn } from '@tanstack/react-start'
import { makeServerOnly } from './factory'
const impl = makeServerOnly(() => 'server-only-value')
export const serverFn = createServerFn().handler(async () => impl())`
    const { compile } = createStartCompiler({
      env: 'server',
      files,
      compilerTransforms: [renderThingTransform],
    })

    expect(
      await settleAsync(async () =>
        callProvider(
          {
            id,
            ssr: (await compile(source, id)) ?? source,
            provider: (await compile(source, `${id}?tss-serverfn-split`))!,
          },
          'serverFn',
          { './factory': { makeServerOnly: uncompiled } },
        ),
      ),
    ).toBe('server-only-value')
  })

  // A binding whose initializer reads itself (code saved mid-edit): compiling
  // settles, with a result or an error, instead of looping.
  test.each([
    `import { createServerFn } from '@tanstack/react-start'
export const fn: any = fn.handler(async () => 'x')
export const real = createServerFn().handler(async () => 'y')`,
  ])('compiling a self-referencing binding settles: %#', async (code) => {
    const { compile } = createStartCompiler({ env: 'client' })
    const settled = await Promise.race([
      compile(code).then(
        () => 'settled',
        () => 'settled',
      ),
      new Promise((resolve) => setTimeout(resolve, 2_000, 'still compiling')),
    ])
    expect(settled).toBe('settled')
  })
})

test('leaves unrelated SSR middleware chains to the bundler when a server function factory is present', async () => {
  const compiler = new StartCompiler({
    envName: 'ssr',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    env: 'server',
    mode: 'build',
    lookupKinds: getLookupKindsForEnv('server'),
    lookupConfigurations: getLookupConfigurationsForEnv('server', 'react'),
    getKnownServerFns: () => ({}),
    resolveId: async () => {
      throw new Error(
        'SSR host has no package import conditions for this unrelated binding',
      )
    },
    loadModule: async () => {
      throw new Error('Unexpected compiler dependency load')
    },
  })
  const code = `import { createMiddleware, createServerFn } from '@tanstack/react-start';
const middleware = createMiddleware({ type: 'function' }).server(({ next }) => next({ context: { role: 'admin' } }));
export const factory = createServerFn().middleware([middleware]);`
  const result = await compiler.compile({
    id: '/test/auth-wrapper.ts',
    code,
    detectedKinds: detectKindsInCode(code, 'server'),
  })
  // The server keeps the middleware chain as written.
  const { factory } = await evaluateModule(
    result?.code ?? code,
    {},
    { env: 'server' },
  )
  const [middleware] = factory.options.middleware
  expect(
    middleware.options.server({ next: (result: unknown) => result }),
  ).toEqual({ context: { role: 'admin' } })
})

test.each([
  `(createServerOnlyFn)(() => 'server-value')`,
  `(createIsomorphicFn)().server(() => 'server-value').client(() => 'client-value')`,
  `(createIsomorphicFn().server(() => 'server-value')).client(() => 'client-value')`,
])(
  'compiles transparent parentheses around native call chains: %s',
  async (expression) => {
    const result = await compileCode(
      'ssr',
      `import { createServerOnlyFn, createIsomorphicFn } from '@tanstack/react-start'; export const fn = ${expression}`,
      { id: '/test/src/parenthesized.ts' },
    )

    expect(result).not.toBeNull()
    const { fn } = await evaluateModule(result!)
    expect(fn()).toBe('server-value')
  },
)

test('compiles a server function through a parenthesized namespace receiver', async () => {
  const { code, serverFns } = await compileFor(
    'client',
    `import * as Start from '@tanstack/react-start'; export const fn = (Start).createServerFn().handler(() => 'private-server-body')`,
    { id: '/test/src/namespace-parenthesized.ts' },
  )
  expect(code).not.toBeNull()
  expect(code).not.toContain('private-server-body')
  expect(Object.keys(serverFns)).toHaveLength(1)
  expect(callerRpcId((await evaluateModule(code!)).fn)).toBe(
    Object.keys(serverFns)[0],
  )
})

// Source: #8504 compiler.test.ts "preserves a shadowed parenthesized
// namespace receiver"
test('leaves a server fn of a parameter shadowing the namespace receiver alone', async () => {
  const code = `import * as Start from '@tanstack/react-start'
export function make(Start) {
  return (Start).createServerFn().handler(() => 'local-runtime-body')
}`
  const client = (await compileCode('client', code)) ?? code
  const { make } = await evaluateModule(client)
  const local = {
    createServerFn: () => ({ handler: (fn: () => string) => fn }),
  }
  expect(make(local)()).toBe('local-runtime-body')
})

// The client output keeps no server implementation; each export still
// evaluates to what the client runtime gives.
test.each<{
  expression: string
  check: (fn: any) => unknown
}>([
  {
    expression: `(Start).createServerOnlyFn(() => 'private-server-body')`,
    check: (fn) => expect(settle(fn)).toEqual(serverOnlyError),
  },
  {
    expression: `(Start).createIsomorphicFn().server(() => 'private-server-body').client(() => 'client-value')`,
    check: (fn) => expect(fn()).toBe('client-value'),
  },
  {
    // A real middleware (Start's runtime object, its options), whose
    // `.client()` still runs and whose `.server()` is gone.
    expression: `(Start).createMiddleware({ type: 'function' }).client(({ next }) => next({ sendContext: { from: 'client-value' } })).server(() => 'private-server-body')`,
    check: async (fn) => {
      expect(fn.options.type).toBe('function')
      expect(fn.options.server).toBeUndefined()
      expect(
        await fn.options.client({ next: (result: unknown) => result }),
      ).toEqual({ sendContext: { from: 'client-value' } })
    },
  },
])(
  'removes server-only code through a parenthesized namespace: $expression',
  async ({ expression, check }) => {
    const result = await compileCode(
      'client',
      `import * as Start from '@tanstack/react-start'; export const fn = ${expression}`,
      { id: '/test/src/namespace-builtins.ts' },
    )
    expect(result).not.toBeNull()
    expect(result).not.toContain('private-server-body')
    const { fn } = await evaluateModule(result!)
    await check(fn)
  },
)
