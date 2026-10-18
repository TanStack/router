/**
 * Server fn ids are deterministic (R4): they depend on the module's path
 * relative to the project root, whatever the root and the path style the
 * bundler gives the compiler (Rsbuild passes Windows paths with `\`, Vite
 * with `/`), and the client RPC of each server fn carries the id its
 * provider handler answers to, whatever order the environments compile the
 * modules in. Generated function names are not asserted.
 * Source: oracle-gaps H3 (round 2).
 */
import { describe, expect, test } from 'vitest'
import { detectKindsInCode } from '../src/start-compiler/compiler'
import {
  createStartCompiler,
  mergeServerFnsById,
} from '../src/start-compiler/host'
import {
  callerRpcId,
  callReportedServerFns,
  createServerGraph,
  evaluateModule,
  serverFnResult,
} from './regression-helpers'
import type { ServerFn } from '../src/start-compiler/types'

type GenerateFunctionId = (opts: {
  filename: string
  functionName: string
}) => string | undefined

/**
 * A Start compiler of one environment, created by the hosts' shared factory
 * (`createStartCompiler`) for a production build under `root`, reporting
 * into `registry` the way the Vite and Rsbuild plugins share one registry
 * between their environments.
 */
function compilerFor(
  env: 'client' | 'server',
  root: string,
  registry: Record<string, ServerFn>,
  generateFunctionId?: GenerateFunctionId,
) {
  const compiler = createStartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'ssr',
    root,
    mode: 'build',
    framework: 'react',
    providerEnvName: 'ssr',
    generateFunctionId,
    onServerFnsById: (serverFns) => mergeServerFnsById(registry, serverFns),
    getKnownServerFns: () => registry,
    loadModule: async () => {},
    resolveId: async (id) => (id.startsWith('@tanstack/') ? id : null),
  })
  return async (code: string, id: string) =>
    (
      await compiler.compile({
        code,
        id,
        detectedKinds: detectKindsInCode(code, env),
      })
    )?.code ?? null
}

const serverFnModule = (name: string, value: string) =>
  `import { createServerFn } from '@tanstack/react-start'
export const ${name} = createServerFn().handler(async () => '${value}')`

/**
 * Handlers of an evaluated provider, by the id in their metadata, each
 * returning the result of its call (`serverFnResult`).
 */
function handlersById(provider: Record<string, any>) {
  const handlers: Record<string, (opts: unknown) => unknown> = {}
  for (const value of Object.values(provider)) {
    if (typeof value === 'function' && value.serverFnMeta?.id !== undefined) {
      handlers[value.serverFnMeta.id] = async (opts: unknown) =>
        serverFnResult(await value(opts))
    }
  }
  return handlers
}

/**
 * Compiles `code` as `<root><sep>src<sep>fns.ts` for the client and the
 * provider. Returns the id of the client's RPC, the ids of the provider's
 * handlers and what calling each server fn the client reported by id
 * returns (like the server-fn resolver).
 */
async function compileUnder(
  root: string,
  sep: '/' | '\\',
  options: { generateFunctionId?: GenerateFunctionId } = {},
) {
  const registry: Record<string, ServerFn> = {}
  const id = [root, 'src', 'fns.ts'].join(sep)
  const code = serverFnModule('fn', 'from the server')
  const client = await compilerFor(
    'client',
    root,
    registry,
    options.generateFunctionId,
  )(code, id)
  const reported = { ...registry }
  const provider = await compilerFor(
    'server',
    root,
    registry,
    options.generateFunctionId,
  )(code, `${id}?tss-serverfn-split`)
  const server = { ssr: undefined, provider: provider!, id }
  return {
    rpc: callerRpcId((await evaluateModule(client!)).fn) as string,
    handlerIds: Object.keys(
      handlersById(await createServerGraph(server).provider()),
    ),
    called: await callReportedServerFns(server, reported),
  }
}

describe('server fn ids', () => {
  const layouts = [
    { name: 'a POSIX root', root: '/a/app', sep: '/' },
    { name: 'a deeper POSIX root', root: '/x/y/app', sep: '/' },
    // Rsbuild (Rspack) module ids and root on Windows.
    { name: 'a Windows root with backslashes', root: 'C:\\app', sep: '\\' },
    // Vite module ids and root on Windows.
    { name: 'a Windows root with slashes', root: 'C:/app', sep: '/' },
  ] as const

  test('are the same under every root and path style, on the client and the provider', async () => {
    const results: Record<string, Awaited<ReturnType<typeof compileUnder>>> = {}
    for (const { name, root, sep } of layouts) {
      results[name] = await compileUnder(root, sep)
    }
    const [first] = Object.values(results)
    expect(first!.handlerIds).toEqual([first!.rpc])
    for (const [name, result] of Object.entries(results)) {
      expect(result, name).toEqual({
        rpc: first!.rpc,
        handlerIds: [first!.rpc],
        called: ['from the server'],
      })
    }
  })

  test.each(layouts)(
    'a custom generateFunctionId gets the path relative to $name, with / separators',
    async ({ root, sep }) => {
      const filenames: Array<string> = []
      const result = await compileUnder(root, sep, {
        generateFunctionId: ({ filename }) => {
          filenames.push(filename)
          return `custom:${filename}`
        },
      })
      expect(new Set(filenames)).toEqual(new Set(['src/fns.ts']))
      // The id it returns (unique here) is the one clients call.
      expect(result.rpc).toBe('custom:src/fns.ts')
      expect(result.handlerIds).toEqual([result.rpc])
      expect(result.called).toEqual(['from the server'])
    },
  )

  test('a generateFunctionId that returns undefined falls back to a working id', async () => {
    const result = await compileUnder('/a/app', '/', {
      generateFunctionId: () => undefined,
    })
    expect(result.rpc).toEqual(expect.any(String))
    expect(result.handlerIds).toEqual([result.rpc])
    expect(result.called).toEqual(['from the server'])
  })

  // The provider gives each server fn of a module the id the client gave it,
  // also when a custom generateFunctionId gives them all the same id.
  test.each([
    { name: 'default ids', generateFunctionId: undefined },
    { name: 'one custom id for all', generateFunctionId: () => 'same-id' },
  ])(
    'each server fn of a module with several reaches its own handler ($name)',
    async ({ generateFunctionId }) => {
      const registry: Record<string, ServerFn> = {}
      const id = '/app/src/fns.ts'
      const code = `import { createServerFn } from '@tanstack/react-start'
export const a = createServerFn().handler(async () => 'from a')
export const b = createServerFn().handler(async () => 'from b')
export const c = createServerFn().handler(async () => 'from c')`
      const client = await evaluateModule(
        (await compilerFor(
          'client',
          '/app',
          registry,
          generateFunctionId,
        )(code, id))!,
      )
      const rpcs: Record<string, string> = {
        a: callerRpcId(client.a)!,
        b: callerRpcId(client.b)!,
        c: callerRpcId(client.c)!,
      }
      expect(new Set(Object.values(rpcs)).size).toBe(3)
      const provider = (await compilerFor(
        'server',
        '/app',
        registry,
        generateFunctionId,
      )(code, `${id}?tss-serverfn-split`))!
      const handlers = handlersById(
        await createServerGraph({ ssr: undefined, provider, id }).provider(),
      )
      const called: Record<string, unknown> = {}
      for (const [name, rpc] of Object.entries(rpcs)) {
        called[name] = await handlers[rpc]?.({})
      }
      expect(called).toEqual({ a: 'from a', b: 'from b', c: 'from c' })
    },
  )

  // Two server fns get the same custom id: the compilers tell them apart,
  // and the server environment, compiling the modules in the other order,
  // gives each the id the client gave it.
  test('colliding custom ids stay paired across environments that compile in different orders', async () => {
    const registry: Record<string, ServerFn> = {}
    const generateFunctionId = () => 'same-id'
    const modules = {
      '/app/src/a.ts': serverFnModule('a', 'from a'),
      '/app/src/b.ts': serverFnModule('b', 'from b'),
    }
    const client = compilerFor('client', '/app', registry, generateFunctionId)
    const rpcs: Record<string, string> = {}
    for (const [id, code] of Object.entries(modules)) {
      const module = await evaluateModule((await client(code, id))!)
      rpcs[id] = callerRpcId(module.a ?? module.b)!
    }
    expect(new Set(Object.values(rpcs)).size).toBe(2)

    const server = compilerFor('server', '/app', registry, generateFunctionId)
    for (const [id, code] of Object.entries(modules).reverse()) {
      const provider = (await server(code, `${id}?tss-serverfn-split`))!
      const ssr = (await server(code, id)) ?? code
      const graph = createServerGraph({
        ssr,
        provider,
        id,
        serverFns: registry,
      })
      const handlers = handlersById(await graph.provider())
      expect(Object.keys(handlers), id).toEqual([rpcs[id]])
      expect(await handlers[rpcs[id]!]!({})).toBe(
        id.endsWith('a.ts') ? 'from a' : 'from b',
      )
      // The SSR caller calls the server fn of its own module.
      const ssrModule = await graph.ssr()
      expect(await (ssrModule.a ?? ssrModule.b)()).toBe(
        id.endsWith('a.ts') ? 'from a' : 'from b',
      )
    }
  })
})
