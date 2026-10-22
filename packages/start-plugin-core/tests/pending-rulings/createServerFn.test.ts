/**
 * Pending ruling Q6 (REPAIR/BRIEF: "the createServerFn :293 / createMiddleware
 * :75/:145 internal-package-graph rows. Keep them until ruled"): moved
 * unchanged from createServerFn/createServerFn.test.ts:293. It drives the
 * internal `StartCompiler` with a hand-built `@tanstack/start-client-core`
 * graph and an empty lookup configuration, held by Q6 until it is ruled.
 */
import { describe, expect, test } from 'vitest'
import { StartCompiler } from '../../src/start-compiler/compiler'
import {
  callerRpcId,
  evaluateModule,
  startClientCore,
} from '../outside-compiler-corpus/legacy/regression-helpers'
import type { ServerFn } from '../../src/start-compiler/types'

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

describe('createServerFn compiles correctly', () => {
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

    const reported: Record<string, ServerFn> = {}
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
      onServerFnsById: (serverFns) => Object.assign(reported, serverFns),
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
    expect(result!.code).not.toContain('server-only-value')
    const ids = Object.keys(reported)
    expect(ids).toHaveLength(1)
    const { getMessage } = await evaluateModule(result!.code, {
      './createServerFn': {
        createServerFn: startClientCore.createServerFn,
      },
    })
    expect(callerRpcId(getMessage)).toBe(ids[0])
  })
})
