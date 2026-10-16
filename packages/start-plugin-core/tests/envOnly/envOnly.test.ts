import { describe, expect, test } from 'vitest'

import { StartCompiler } from '../../src/start-compiler/compiler'

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

async function compile(opts: {
  env: 'client' | 'server'
  code: string
  id: string
}) {
  const compiler = new StartCompiler({
    ...opts,
    ...getDefaultTestOptions(opts.env),
    loadModule: async () => {
      // do nothing in test
    },
    lookupKinds: new Set(['ServerOnlyFn', 'ClientOnlyFn']),
    lookupConfigurations: [
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createServerOnlyFn',
        kind: 'ServerOnlyFn',
      },
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createClientOnlyFn',
        kind: 'ClientOnlyFn',
      },
    ],
    getKnownServerFns: () => ({}),
    resolveId: async (id) => {
      return id
    },
  })
  const result = await compiler.compile({
    code: opts.code,
    id: opts.id,
  })
  return result
}

describe('envOnly functions compile correctly', () => {
  test('should error if implementation not provided', async () => {
    await expect(
      compile({
        env: 'client',
        code: `
        import { createClientOnlyFn } from '@tanstack/react-start'
        const fn = createClientOnlyFn()`,
        id: 'no-fn.ts',
      }),
    ).rejects.toThrowError()

    await expect(
      compile({
        env: 'server',
        code: `
        import { createServerOnlyFn } from '@tanstack/react-start'
        const fn = createServerOnlyFn()`,
        id: 'no-fn.ts',
      }),
    ).rejects.toThrowError()
  })
})
