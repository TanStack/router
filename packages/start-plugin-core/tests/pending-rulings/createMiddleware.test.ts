/**
 * Pending ruling Q6 (REPAIR/BRIEF: "the createServerFn :293 /
 * createMiddleware :75/:145 internal-package-graph rows; keep them until
 * ruled"). Moved unchanged from createMiddleware/createMiddleware.test.ts
 * :75 and :145 (workstream B2): they compile hand-written Start package
 * sources through the internal `StartCompiler` (the legacy harness), so the
 * import-gate violations of this file are expected until Q6 is ruled.
 */
import { describe, expect, test } from 'vitest'
import { StartCompiler } from '../../src/start-compiler/compiler'
import {
  createStartCompiler,
  evaluateModule,
  startClientCore,
} from '../outside-compiler-corpus/legacy/regression-helpers'

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

/** A Start factory left uncompiled: calling it fails the test. */
const uncompiled = () => {
  throw new Error('uncompiled Start factory')
}

/**
 * Start's own middleware factory module: the real `createMiddleware`, whose
 * builder fails the test when `.server()` is called, so a module evaluates
 * only without it.
 */
const middlewareFactoryStub = {
  createMiddleware: (...args: Array<unknown>) => ({
    ...startClientCore.createMiddleware(...args),
    server: uncompiled,
  }),
}

describe('createMiddleware compiles correctly', () => {
  test('should resolve createMiddleware from start-client-core implementation file', async () => {
    const virtualModules: Record<string, string> = {
      '@tanstack/start-client-core': `
        export { createMiddleware } from './createMiddleware'
        export { createIsomorphicFn } from '@tanstack/start-fn-stubs'
      `,
      '/virtual/compiler-known/middleware-factory.ts': `
        export const createMiddleware = () => ({
          server: () => createMiddleware(),
        })
      `,
    }

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      loadModule: async (id) => {
        const code = virtualModules[id]
        if (code) {
          compiler.ingestModule({ code, id })
        }
      },
      lookupKinds: new Set(['Middleware', 'IsomorphicFn']),
      lookupConfigurations: [],
      getKnownServerFns: () => ({}),
      resolveId: async (source) => {
        if (source === '@tanstack/start-client-core') {
          return '@tanstack/start-client-core'
        }

        if (source === './createMiddleware') {
          return '/virtual/compiler-known/middleware-factory.ts'
        }

        return null
      },
    })

    const result = await compiler.compile({
      id: '/repo/packages/start-client-core/src/createCsrfMiddleware.ts',
      code: `
        import { createIsomorphicFn } from '@tanstack/start-fn-stubs'
        import { createMiddleware } from './createMiddleware'

        const innerCreateCsrfMiddleware = () => {
          return createMiddleware().server(() => 'server-only-middleware')
        }

        export const createCsrfMiddleware = createIsomorphicFn()
          .server(innerCreateCsrfMiddleware)
      `,
    })

    expect(result).not.toBeNull()
    expect(result!.code).not.toContain('server-only-middleware')
    // On the client, the isomorphic fn without a client implementation is a
    // no-op.
    const { createCsrfMiddleware } = await evaluateModule(result!.code, {
      '@tanstack/start-fn-stubs': {
        createIsomorphicFn: () =>
          Object.assign(() => undefined, {
            server: uncompiled,
            client: uncompiled,
          }),
      },
      './createMiddleware': middlewareFactoryStub,
    })
    expect(createCsrfMiddleware()).toBeUndefined()
  })

  test('should resolve namespace createMiddleware from start-client-core implementation file', async () => {
    // A module of Start's own client package (its middleware factory module
    // is the one `@tanstack/start-client-core` re-exports).
    const { compile } = createStartCompiler({
      env: 'client',
      files: {
        '@tanstack/start-client-core': `export { createMiddleware } from './createMiddleware'`,
        '/test/src/createMiddleware.ts': `export const createMiddleware = () => ({
  server: () => createMiddleware(),
})`,
      },
    })

    const result = await compile(
      `import * as middlewareModule from './createMiddleware'

export const middleware = middlewareModule.createMiddleware().server(() => {
  return 'server-only-middleware'
})`,
      '/test/src/internal.ts',
    )

    expect(result).not.toBeNull()
    expect(result).not.toContain('server-only-middleware')
    // `.server()` fails the test (`middlewareFactoryStub`): the module
    // evaluates only without it.
    const { middleware } = await evaluateModule(result!, {
      './createMiddleware': middlewareFactoryStub,
    })
    expect(middleware).toBeDefined()
  })
})
