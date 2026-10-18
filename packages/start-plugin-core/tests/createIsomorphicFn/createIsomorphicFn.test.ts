import { describe, expect, test, vi } from 'vitest'
import {
  compileCode,
  evaluateModule,
  importSources,
} from '../regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'

// Each output runs only its environment's implementation; an isomorphic fn
// without one for that environment is a no-op returning undefined, and the
// client has no server implementation. `noImpl` stays a runtime call.
// Replaces the former snapshot fixtures of this directory (N2).
describe('each output runs the implementation of its environment', () => {
  const stubs = {
    './x.server': { server: (value: string) => value },
    './x.client': { client: (value: string) => value },
  }

  /** Imports of the modules below whose implementations read `./x.*`. */
  const envImports = `import { server } from './x.server'
import { client } from './x.client'
`

  /**
   * The client does not import the server module, and the SSR output does
   * not import the `.client` module (import protection denies it on the
   * server, user ruling 2026-10-18).
   */
  function expectEnvImports(
    outputs: Record<'client' | 'ssr', { code: string }>,
  ) {
    expect(importSources(outputs.client.code)).not.toContain('./x.server')
    expect(importSources(outputs.ssr.code)).not.toContain('./x.client')
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
        module: await evaluateModule(compiled, stubs, {
          env: output === 'client' ? 'client' : 'server',
        }),
      }
    }
    return results
  }

  /** Calls the named exports of a module. */
  const call = (module: Record<string, any>, names: Array<string>) =>
    Object.fromEntries(names.map((name) => [name, module[name]()]))

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
  return 'SERVER_IMPL'
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
    const names = [
      'noImpl',
      'serverOnlyFn',
      'clientOnlyFn',
      'serverThenClientFn',
      'clientThenServerFn',
      'serverOnlyFnAbstracted',
      'clientOnlyFnAbstracted',
      'serverThenClientFnAbstracted',
      'clientThenServerFnAbstracted',
    ]
    expect(call(client.module, names)).toEqual({
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
    expect(call(ssr.module, names)).toEqual({
      noImpl: undefined,
      serverOnlyFn: 'server',
      clientOnlyFn: undefined,
      serverThenClientFn: 'server',
      clientThenServerFn: 'server',
      serverOnlyFnAbstracted: 'SERVER_IMPL',
      clientOnlyFnAbstracted: undefined,
      serverThenClientFnAbstracted: 'SERVER_IMPL',
      clientThenServerFnAbstracted: 'SERVER_IMPL',
    })
    expect(client.code).not.toContain('SERVER_IMPL')
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
    const callFactories = (module: Record<string, any>) => [
      module.createPlatformFn('web')(),
      module.createServerImplFn('a')(),
      module.createClientImplFn('b')(),
      module.createNoImplFn()(),
      module.topLevelIsomorphicFn(),
    ]
    expect(callFactories(client.module)).toEqual([
      'client-web',
      undefined,
      'client-b',
      undefined,
      'client',
    ])
    expect(callFactories(ssr.module)).toEqual([
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
    const names = [
      'getPlatformValue',
      'getEnvironment',
      'getDirectValue',
      'getMultipleValues',
      'getServerOnlyValue',
      'getClientOnlyValue',
    ]
    expect(call(client.module, names)).toEqual({
      getPlatformValue: 'client-value',
      getEnvironment: 'running on client',
      getDirectValue: 'direct-client',
      getMultipleValues: ['first-client', 'second-client'],
      getServerOnlyValue: undefined,
      getClientOnlyValue: 'client-only-value',
    })
    expect(call(ssr.module, names)).toEqual({
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

describe('isomorphic fns next to other code', () => {
  test('a top-level call next to a server fn returns the value of each environment', async () => {
    const code = `import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'
const getEnv = createIsomorphicFn().server(() => 'server').client(() => 'client')
export const env = getEnv()
export const fn = createServerFn().handler(async () => 'x')`
    const client = await evaluateModule((await compileCode('client', code))!)
    expect(client.env).toBe('client')
    const ssr = await evaluateModule(
      (await compileCode('ssr', code))!,
      {},
      { env: 'server' },
    )
    expect(ssr.env).toBe('server')
  })

  test('a builder kept in a variable', async () => {
    const code = `import { createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
const iso = createIsomorphicFn()
export const fn = iso.server(() => db.x()).client(() => 'client')`
    const client = (await compileCode('client', code)) ?? code
    expect(importSources(client)).not.toContain('./db.server')
    expect((await evaluateModule(client)).fn()).toBe('client')
  })

  test('a .client() call on a global object is left alone', async () => {
    const code = `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = createIsomorphicFn().server(() => 'server').client(() => 'client')
export const viaGlobal = () => ws.client()`
    const client = (await compileCode('client', code)) ?? code
    vi.stubGlobal('ws', { client: () => 'global' })
    try {
      const module = await evaluateModule(client)
      expect(module.fn()).toBe('client')
      expect(module.viaGlobal()).toBe('global')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
