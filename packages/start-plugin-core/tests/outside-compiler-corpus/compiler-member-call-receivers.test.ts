/**
 * Implementation control (outside the compiler test corpus: see
 * packages/compiler-test-utils/AGENTS.md): from main's #8758, which stops the
 * Start compiler resolving `receiver.method()` calls whose receiver is a named
 * (not namespace) import. It counts the modules today's compiler resolves and
 * loads (a perf counter) and reads the printed output, both of which a correct
 * rewrite may do differently. The corpus decides the outcomes: namespace and
 * renamed factory imports in start-compiler-import-forms.test.ts and
 * known-bugs-start-compiler.test.ts, user code kept in
 * start-compiler-preserves-user-code.test.ts.
 */
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../src/start-compiler/config'

function getDefaultTestOptions(env: 'client' | 'server') {
  const envName = env === 'client' ? 'client' : 'ssr'
  return {
    envName,
    root: '/test',
    framework: 'react' as const,
    providerEnvName: 'ssr',
  }
}

describe.each(['build', 'dev'] as const)(
  'top-level member calls in %s mode',
  (mode) => {
    function createCompilerWithModules(
      env: 'client' | 'server',
      virtualModules: Record<string, string>,
    ) {
      const resolved: Array<string> = []
      const loaded: Array<string> = []
      const compiler: StartCompiler = new StartCompiler({
        ...getDefaultTestOptions(env),
        env,
        mode,
        devServerFnModuleSpecifierEncoder: ({ extractedFilename, root }) =>
          `/@id${extractedFilename.slice(root.length)}`,
        lookupKinds: getLookupKindsForEnv(env),
        lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
        getKnownServerFns: () => ({}),
        resolveId: async (id) => {
          resolved.push(id)
          return id in virtualModules ? id : null
        },
        loadModule: async (id) => {
          loaded.push(id)
          const code = virtualModules[id]
          if (code) {
            compiler.ingestModule({ code, id })
          }
        },
      })
      return { compiler, resolved, loaded }
    }

    describe.each(['fast', 'full'] as const)('%s traversal', (traversal) => {
      // An isomorphic function requires full traversal; server functions alone
      // use the compiler's fast path. Let normal code detection choose the path.
      const traversalCode =
        traversal === 'full'
          ? `import { createIsomorphicFn } from '@tanstack/react-start'
         export const iso = createIsomorphicFn().client(() => 'client').server(() => 'server')`
          : ''

      test.each(['client', 'ssr', 'provider'] as const)(
        'does not resolve or load named-import receivers in %s output',
        async (output) => {
          const env = output === 'client' ? 'client' : 'server'
          const { compiler, resolved, loaded } = createCompilerWithModules(
            env,
            {
              zod: `export const z = { object: (shape) => shape, string: () => ({}) }`,
              './api': `export const api = { users: () => [] }`,
            },
          )
          const code = `
      ${traversalCode}
      import { createServerFn } from '@tanstack/react-start'
      import { z } from 'zod'
      import { api } from './api'

      const Input = z.object({ id: z.string() })
      const users = api.users()

      export const getUser = createServerFn()
        .validator(Input)
        .handler(async ({ data }) => ({ id: data.id, users }))
    `

          const result = await compiler.compile({
            id:
              '/test/get-user.ts' +
              (output === 'provider' ? '?tss-serverfn-split' : ''),
            code,
            detectedKinds: detectKindsInCode(code, env),
          })

          expect(result).not.toBeNull()
          const rpc = {
            client: 'createClientRpc',
            ssr: 'createSsrRpc',
            provider: 'createServerRpc',
          }
          expect(result!.code).toContain(rpc[output])
          expect(resolved).toEqual([])
          expect(loaded).toEqual([])
        },
      )

      test.each(['client', 'server'] as const)(
        'still compiles a renamed env-only factory called through a namespace import on %s',
        async (env) => {
          const { compiler } = createCompilerWithModules(env, {
            './factory': `export { createServerOnlyFn as serverOnly } from '@tanstack/start-fn-stubs'`,
          })
          const code = `
        ${traversalCode}
        import { createServerFn } from '@tanstack/react-start'
        import * as factory from './factory'

        export const impl = factory.serverOnly(() => 'server-only-value')

        export const fn = createServerFn().handler(async () => impl())
      `

          const result = await compiler.compile({
            id: '/test/namespace-factory.ts',
            code,
            detectedKinds: detectKindsInCode(code, env),
          })

          expect(result).not.toBeNull()
          if (env === 'server') {
            expect(result!.code).toContain('server-only-value')
            expect(result!.code).not.toContain('factory.serverOnly')
          } else {
            expect(result!.code).not.toContain('server-only-value')
            expect(result!.code).toContain('throw new Error')
          }
        },
      )
    })
  },
)
