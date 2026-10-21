/**
 * Implementation tests (outside the compiler corpus), moved unchanged from
 * compiler.test.ts (workstream B2): they drive the internal `StartCompiler`
 * (one compiler instance reused across modules, `invalidateModule`, host
 * hooks that throw when called). The concepts are decided in the corpus,
 * through the public Start host: compiler.test.ts "several modules of one
 * app, of different kinds, compile correctly", "a dev edit of a module a
 * re-export chain ends in recompiles its importers", "recompiles aliased
 * env-only calls of a server fn module whose source only mentions
 * createServerFn" and "leaves unrelated SSR middleware chains as written
 * when a server function factory is present". What stays here is how
 * today's compiler is built: a single instance, its invalidation call, and
 * that it never resolves or loads an unrelated binding.
 */
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../src/start-compiler/config'
import {
  callProvider,
  callerRpcId,
  clientOnlyError,
  createStartCompiler,
  evaluateModule,
  serverOnlyError,
  settle,
  settleAsync,
} from './legacy/regression-helpers'

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

describe('invalidation', () => {
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
