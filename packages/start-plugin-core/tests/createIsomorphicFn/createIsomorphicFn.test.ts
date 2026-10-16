import { describe, expect, test } from 'vitest'

import { StartCompiler } from '../../src/start-compiler/compiler'
import {
  compileCode,
  evaluateModule,
  importSources,
} from '../regression-helpers'
import {
  declarationOf,
  getModuleErrors,
} from '@tanstack/compiler-test-utils/validate-module'

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
    lookupKinds: new Set(['IsomorphicFn']),
    lookupConfigurations: [
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createIsomorphicFn',
        kind: 'IsomorphicFn',
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

describe('createIsomorphicFn compiles correctly', () => {
  test('should error if implementation not provided', async () => {
    await expect(
      compile({
        env: 'client',
        code: `
        import { createIsomorphicFn } from '@tanstack/react-start'
        const clientOnly = createIsomorphicFn().client()`,
        id: 'no-fn.ts',
      }),
    ).rejects.toThrowError()

    await expect(
      compile({
        env: 'server',
        code: `
        import { createIsomorphicFn } from '@tanstack/react-start'
        const serverOnly = createIsomorphicFn().server()`,
        id: 'no-fn.ts',
      }),
    ).rejects.toThrowError()
  })
})

// Each output runs only its environment's implementation; an isomorphic fn
// without one for that environment is a no-op returning undefined, and the
// other environment's implementation (and the function it references) is
// absent. `noImpl` stays a runtime call (stubbed here).
// Replaces the former snapshot fixtures of this directory (N2).
describe('each output runs the implementation of its environment', () => {
  /** Runtime stub of an isomorphic fn without implementations. */
  const stubs = {
    '@tanstack/react-start': { createIsomorphicFn: () => () => undefined },
    './x.server': { server: (value: string) => value },
    './x.client': { client: (value: string) => value },
  }

  /** Imports of the modules below whose implementations read `./x.*`. */
  const envImports = `import { server } from './x.server'
import { client } from './x.client'
`

  /** Each output imports only the module its implementations read. */
  function expectEnvImports(
    outputs: Record<'client' | 'ssr', { code: string }>,
  ) {
    expect(importSources(outputs.client.code)).toEqual(['./x.client'])
    expect(importSources(outputs.ssr.code)).toEqual(['./x.server'])
  }

  /** Compiles `code` for the client and SSR, checks and evaluates both. */
  async function evaluateOutputs(code: string) {
    const results = {} as Record<
      'client' | 'ssr',
      { code: string; module: Record<string, any> }
    >
    for (const output of ['client', 'ssr'] as const) {
      const compiled = (await compileCode(output, code)) ?? code
      expect(await getModuleErrors(compiled), output).toEqual([])
      results[output] = {
        code: compiled,
        module: await evaluateModule(compiled, stubs),
      }
    }
    return results
  }

  // Source: snapshot fixtures createIsomorphicFnDestructured.tsx (and its
  // Rename / StarImport variants)
  test('one implementation, both orders and function references', async () => {
    const { client, ssr } =
      await evaluateOutputs(`import { createIsomorphicFn } from '@tanstack/react-start'
export const noImpl = createIsomorphicFn()
export const serverOnlyFn = createIsomorphicFn().server(() => 'server')
export const clientOnlyFn = createIsomorphicFn().client(() => 'client')
export const serverThenClientFn = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
export const clientThenServerFn = createIsomorphicFn()
  .client(() => 'client')
  .server(() => 'server')
function abstractedServerFn() {
  return 'server'
}
export const serverOnlyFnAbstracted = createIsomorphicFn().server(abstractedServerFn)
function abstractedClientFn() {
  return 'client'
}
export const clientOnlyFnAbstracted = createIsomorphicFn().client(abstractedClientFn)
export const serverThenClientFnAbstracted = createIsomorphicFn()
  .server(abstractedServerFn)
  .client(abstractedClientFn)
export const clientThenServerFnAbstracted = createIsomorphicFn()
  .client(abstractedClientFn)
  .server(abstractedServerFn)`)
    const call = (module: Record<string, any>) =>
      Object.fromEntries(
        Object.entries(module).map(([name, fn]) => [name, fn()]),
      )
    expect(call(client.module)).toEqual({
      noImpl: undefined,
      serverOnlyFn: undefined,
      clientOnlyFn: 'client',
      serverThenClientFn: 'client',
      clientThenServerFn: 'client',
      serverOnlyFnAbstracted: undefined,
      clientOnlyFnAbstracted: 'client',
      serverThenClientFnAbstracted: 'client',
      clientThenServerFnAbstracted: 'client',
    })
    expect(call(ssr.module)).toEqual({
      noImpl: undefined,
      serverOnlyFn: 'server',
      clientOnlyFn: undefined,
      serverThenClientFn: 'server',
      clientThenServerFn: 'server',
      serverOnlyFnAbstracted: 'server',
      clientOnlyFnAbstracted: undefined,
      serverThenClientFnAbstracted: 'server',
      clientThenServerFnAbstracted: 'server',
    })
    expect(client.code).not.toMatch(declarationOf('abstractedServerFn'))
    expect(ssr.code).not.toMatch(declarationOf('abstractedClientFn'))
  })

  // Source: snapshot fixture createIsomorphicFnFactory.tsx
  test('isomorphic fns returned by factories', async () => {
    const { client, ssr } =
      await evaluateOutputs(`import { createIsomorphicFn } from '@tanstack/react-start'
${envImports}export function createPlatformFn(platform: string) {
  return createIsomorphicFn()
    .client(() => client(\`client-\${platform}\`))
    .server(() => server(\`server-\${platform}\`))
}
export const createServerImplFn = (name: string) => {
  return createIsomorphicFn().server(() => server(\`server-\${name}\`))
}
export const createClientImplFn = (name: string) => {
  return createIsomorphicFn().client(() => client(\`client-\${name}\`))
}
export function createNoImplFn() {
  return createIsomorphicFn()
}
export const topLevelIsomorphicFn = createIsomorphicFn()
  .client(() => client('client'))
  .server(() => server('server'))`)
    const call = (module: Record<string, any>) => [
      module.createPlatformFn('web')(),
      module.createServerImplFn('a')(),
      module.createClientImplFn('b')(),
      module.createNoImplFn()(),
      module.topLevelIsomorphicFn(),
    ]
    expect(call(client.module)).toEqual([
      'client-web',
      undefined,
      'client-b',
      undefined,
      'client',
    ])
    expect(call(ssr.module)).toEqual([
      'server-web',
      'server-a',
      undefined,
      undefined,
      'server',
    ])
    expectEnvImports({ client, ssr })
  })

  // Source: snapshot fixture createIsomorphicFnInline.tsx
  test('isomorphic fns created and called inside functions', async () => {
    const { client, ssr } =
      await evaluateOutputs(`import { createIsomorphicFn } from '@tanstack/react-start'
${envImports}export function getPlatformValue() {
  const fn = createIsomorphicFn()
    .client(() => client('client-value'))
    .server(() => server('server-value'))
  return fn()
}
export const getEnvironment = () => {
  const envFn = createIsomorphicFn()
    .server(() => server('running on server'))
    .client(() => client('running on client'))
  return envFn()
}
export function getDirectValue() {
  return createIsomorphicFn()
    .client(() => client('direct-client'))
    .server(() => server('direct-server'))()
}
export function getMultipleValues() {
  const first = createIsomorphicFn()
    .client(() => client('first-client'))
    .server(() => server('first-server'))
  const second = createIsomorphicFn()
    .client(() => client('second-client'))
    .server(() => server('second-server'))
  return [first(), second()]
}
export function getServerOnlyValue() {
  const fn = createIsomorphicFn().server(() => server('server-only-value'))
  return fn()
}
export function getClientOnlyValue() {
  const fn = createIsomorphicFn().client(() => client('client-only-value'))
  return fn()
}
export const moduleLevel = getEnvironment()`)
    const call = ({ moduleLevel, ...module }: Record<string, any>) =>
      Object.fromEntries(
        Object.entries(module).map(([name, fn]) => [name, fn()]),
      )
    expect(call(client.module)).toEqual({
      getPlatformValue: 'client-value',
      getEnvironment: 'running on client',
      getDirectValue: 'direct-client',
      getMultipleValues: ['first-client', 'second-client'],
      getServerOnlyValue: undefined,
      getClientOnlyValue: 'client-only-value',
    })
    expect(call(ssr.module)).toEqual({
      getPlatformValue: 'server-value',
      getEnvironment: 'running on server',
      getDirectValue: 'direct-server',
      getMultipleValues: ['first-server', 'second-server'],
      getServerOnlyValue: 'server-only-value',
      getClientOnlyValue: undefined,
    })
    // Called while the module evaluates, at its top level.
    expect([client.module.moduleLevel, ssr.module.moduleLevel]).toEqual([
      'running on client',
      'running on server',
    ])
    expectEnvImports({ client, ssr })
  })
})
