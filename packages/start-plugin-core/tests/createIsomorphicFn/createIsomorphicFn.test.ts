import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import { inPage, serveCase, useStartHost } from '../regression-helpers'
import type { ServedCase } from '../regression-helpers'

const host = useStartHost()

/** What a call returned, `undefined` spelled out (results cross JSON). */
const UNDEFINED = '<undefined>'

/** Calls the named exports of the case module in the page (the client). */
function callOnClient(served: ServedCase, names: Array<string>) {
  return inPage(
    served,
    `return Object.fromEntries(${JSON.stringify(names)}.map((name) => {
  const value = module[name]()
  return [name, value === undefined ? ${JSON.stringify(UNDEFINED)} : value]
}))`,
  )
}

/** Calls the named exports of the module the SSR environment evaluated. */
async function callOnServer(served: ServedCase, names: Array<string>) {
  const module = await served.ssr()
  return Object.fromEntries(
    names.map((name) => {
      const value = module[name]()
      return [name, value === undefined ? UNDEFINED : value]
    }),
  )
}

// Each output runs only its environment's implementation; an isomorphic fn
// without one for that environment is a no-op returning undefined, and the
// client has no server implementation. `noImpl` stays a runtime call.
// Replaces the former snapshot fixtures of this directory.
describe('each output runs the implementation of its environment', () => {
  const files = {
    'x.server.ts': `export const server = (value: string) => value\n`,
    'x.client.ts': `export const client = (value: string) => value\n`,
  }

  /** Imports of the modules below whose implementations read `./x.*`. */
  const envImports = `import { server } from './x.server'
import { client } from './x.client'
`

  /**
   * The client does not load the server module, and the SSR environment
   * does not load the `.client` module (import protection denies it on the
   * server, SPEC J4.11, §5.12).
   */
  async function expectEnvImports(served: ServedCase) {
    expectNotLoaded(await served.loads(), ['./x.server'])
    expectNotLoaded(await served.serverLoads(), ['./x.client'])
  }

  /**
   * A case of `code` with the `./x.*` modules, which both environments
   * serve and evaluate.
   */
  async function evaluateOutputs(code: string) {
    return serveCase(await host(), { 'module.tsx': code, ...files })
  }

  // Source: snapshot fixtures createIsomorphicFnDestructured.tsx (and its
  // Rename / StarImport variants)
  test('one implementation, both orders and function references', async () => {
    const served =
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
    expect(await callOnClient(served, names)).toEqual({
      noImpl: UNDEFINED,
      serverOnlyFn: UNDEFINED,
      clientOnlyFn: 'client',
      serverThenClientFn: 'client',
      clientThenServerFn: 'client',
      serverOnlyFnAbstracted: UNDEFINED,
      clientOnlyFnAbstracted: 'client',
      serverThenClientFnAbstracted: 'client',
      clientThenServerFnAbstracted: 'client',
    })
    expect(await callOnServer(served, names)).toEqual({
      noImpl: UNDEFINED,
      serverOnlyFn: 'server',
      clientOnlyFn: UNDEFINED,
      serverThenClientFn: 'server',
      clientThenServerFn: 'server',
      serverOnlyFnAbstracted: 'SERVER_IMPL',
      clientOnlyFnAbstracted: UNDEFINED,
      serverThenClientFnAbstracted: 'SERVER_IMPL',
      clientThenServerFnAbstracted: 'SERVER_IMPL',
    })
    expect(served.code.client).not.toContain('SERVER_IMPL')
  })

  // Source: snapshot fixture createIsomorphicFnFactory.tsx
  test('isomorphic fns returned by factories', async () => {
    const served =
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
    const callFactories = `[
  module.createPlatformFn('web')(),
  module.createServerImplFn('a')(),
  module.createClientImplFn('b')(),
  module.createNoImplFn()(),
  module.topLevelIsomorphicFn(),
].map((value) => (value === undefined ? ${JSON.stringify(UNDEFINED)} : value))`
    expect(await inPage(served, `return ${callFactories}`)).toEqual([
      'client-web',
      UNDEFINED,
      'client-b',
      UNDEFINED,
      'client',
    ])
    const ssr = await served.ssr()
    expect(new Function('module', `return ${callFactories}`)(ssr)).toEqual([
      'server-web',
      'server-a',
      UNDEFINED,
      UNDEFINED,
      'server',
    ])
    await expectEnvImports(served)
  })

  // Source: snapshot fixture createIsomorphicFnInline.tsx
  test('isomorphic fns created and called inside functions', async () => {
    const served =
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
    expect(await callOnClient(served, names)).toEqual({
      getPlatformValue: 'client-value',
      getEnvironment: 'running on client',
      getDirectValue: 'direct-client',
      getMultipleValues: ['first-client', 'second-client'],
      getServerOnlyValue: UNDEFINED,
      getClientOnlyValue: 'client-only-value',
    })
    expect(await callOnServer(served, names)).toEqual({
      getPlatformValue: 'server-value',
      getEnvironment: 'running on server',
      getDirectValue: 'direct-server',
      getMultipleValues: ['first-server', 'second-server'],
      getServerOnlyValue: 'server-only-value',
      getClientOnlyValue: UNDEFINED,
    })
    // Called while the module evaluates, at its top level.
    expect([
      await inPage(served, 'return module.moduleLevel'),
      (await served.ssr()).moduleLevel,
    ]).toEqual(['running on client', 'running on server'])
    await expectEnvImports(served)
  })
})

describe('isomorphic fns next to other code', () => {
  test('a top-level call next to a server fn returns the value of each environment', async () => {
    const code = `import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'
const getEnv = createIsomorphicFn().server(() => 'server').client(() => 'client')
export const env = getEnv()
export const fn = createServerFn().handler(async () => 'x')`
    const served = await serveCase(await host(), { 'module.tsx': code })
    expect(await inPage(served, 'return module.env')).toBe('client')
    expect((await served.ssr()).env).toBe('server')
  })

  test('a builder kept in a variable', async () => {
    const code = `import { createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
const iso = createIsomorphicFn()
export const fn = iso.server(() => db.x()).client(() => 'client')`
    const served = await serveCase(await host(), {
      'module.tsx': code,
      'db.server.ts': `export const db = { x: () => 'server' }\n`,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(await inPage(served, 'return module.fn()')).toBe('client')
  })

  test('a .client() call on a global object is left alone', async () => {
    const code = `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = createIsomorphicFn().server(() => 'server').client(() => 'client')
export const viaGlobal = () => ws.client()`
    const served = await serveCase(await host(), { 'module.tsx': code })
    expect(
      await inPage(
        served,
        `globalThis.ws = { client: () => 'global' }
try {
  return [module.fn(), module.viaGlobal()]
} finally {
  delete globalThis.ws
}`,
      ),
    ).toEqual(['client', 'global'])
  })
})
