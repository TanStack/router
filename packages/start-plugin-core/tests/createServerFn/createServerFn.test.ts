import { stripVTControlCharacters } from 'node:util'
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  getLookupKindsForEnv,
} from '../../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../src/start-compiler/config'
import { generateServerFnResolverModule } from '../../src/start-compiler/server-fn-resolver-module'
import {
  callProvider,
  compileAll,
  compileFor,
  createServerGraph,
  createStartCompiler,
  evaluateModule,
  evaluateProvider,
  importSources,
} from '../regression-helpers'
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

const TSS_SERVERFN_SPLIT_PARAM = 'tss-serverfn-split'

async function compile(opts: {
  env: 'client' | 'server'
  code: string
  parserFilename?: string
  isProviderFile: boolean
  mode: 'dev' | 'build'
}) {
  // Use an absolute path inside the test root to ensure consistent filename output
  let id = '/test/src/test.ts'

  if (opts.isProviderFile) {
    id += `?${TSS_SERVERFN_SPLIT_PARAM}`
  }

  const compiler = new StartCompiler({
    ...opts,
    ...getDefaultTestOptions(opts.env),
    loadModule: async (id) => {
      // do nothing in test
    },
    lookupKinds: new Set(['ServerFn']),
    lookupConfigurations: [
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createServerFn',
        kind: 'Root',
      },
    ],
    getKnownServerFns: () => ({}),
    resolveId: async (id) => {
      return id
    },
  })
  const result = await compiler.compile({
    code: opts.code,
    id,
    parserFilename: opts.parserFilename,
  })
  return result
}

describe('createServerFn compiles correctly', () => {
  // Editors count \n, \r\n, a lone \r, U+2028 and U+2029 as line
  // terminators, so diagnostic locations must count every one.
  test.each([
    ['\\n', '\n'],
    ['\\r\\n', '\r\n'],
    ['a lone \\r', '\r'],
    ['U+2028', '\u2028'],
    ['U+2029', '\u2029'],
  ])(
    'reports the location of a diagnostic with %s line endings',
    async (_name, eol) => {
      const error = await compile({
        code: [
          `import { createServerFn } from '@tanstack/react-start'`,
          `export const { fn } = createServerFn().handler(async () => 1)`,
        ].join(eol),
        env: 'client',
        isProviderFile: false,
        mode: 'build',
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      // The location: line 2 and its source on one line of the message,
      // whatever the code frame format.
      expect(stripVTControlCharacters((error as Error).message)).toMatch(
        /\b2\b[^\n]*export const \{ fn \}/,
      )
    },
  )

  test('should not remove handler identifier bindings that are still referenced', async () => {
    const compiled =
      await compileAll(`import { createServerFn } from '@tanstack/react-start'
import { getUsers } from './server'

export const getUsersFn = createServerFn().handler(getUsers)
export const ref = getUsers`)
    const stubs = { './server': { getUsers: async () => 'users' } }

    expect(importSources(compiled.client)).toEqual(['./server'])
    const client = await evaluateModule(compiled.client, stubs)
    expect(client.ref).toBe(stubs['./server'].getUsers)
    expect(client.getUsersFn).toEqual({ rpc: { client: expect.any(String) } })
    expect(await callProvider(compiled, 'getUsersFn', stubs)).toBe('users')
  })

  test('should compile server functions wrapped in TypeScript as expressions', async () => {
    const code = `
      import { createServerFn } from '@tanstack/react-start'

      export const getUsersFn = createServerFn().handler(() => 'server') as any
    `

    const compiledResult = await compile({
      code,
      env: 'client',
      isProviderFile: false,
      mode: 'build',
    })

    expect(compiledResult).not.toBeNull()
    expect(compiledResult!.code).toContain('createClientRpc')
    expect(compiledResult!.code).not.toContain('server')
  })

  test('should compile server functions wrapped in TypeScript satisfies expressions', async () => {
    const code = `
      import { createServerFn } from '@tanstack/react-start'

      export const getUsersFn = createServerFn().handler(() => 'server') satisfies unknown
    `

    const compiledResult = await compile({
      code,
      env: 'client',
      isProviderFile: false,
      mode: 'build',
    })

    expect(compiledResult).not.toBeNull()
    expect(compiledResult!.code).toContain('createClientRpc')
    expect(compiledResult!.code).not.toContain('server')
  })

  test('keeps query-bearing virtual module identities distinct', async () => {
    // Two virtual modules that differ only by their query: the public one
    // re-exports the factory the implementation one defines.
    const publicFactoryId = '\0virtual:server-fn-factory?variant=public'
    const implementationFactoryId =
      '\0virtual:server-fn-factory?variant=implementation'
    const { compile, serverFns } = createStartCompiler({
      env: 'client',
      files: {
        [publicFactoryId]: `import { createIssueServerFn } from 'virtual:server-fn-factory?variant=implementation'
export { createIssueServerFn }`,
        [implementationFactoryId]: `import { createServerFn } from '@tanstack/react-start'
export const createIssueServerFn = createServerFn`,
      },
      host: {
        resolveId: async (source) =>
          source.startsWith('virtual:server-fn-factory?')
            ? `\0${source}`
            : source.startsWith('@tanstack/')
              ? source
              : null,
      },
    })

    const result = await compile(
      `import { createIssueServerFn } from 'virtual:server-fn-factory?variant=public'
export const issueServerFn = createIssueServerFn().handler(async () => 'issue-handler')`,
      '/test/src/test.ts',
    )

    expect(result).not.toBeNull()
    expect(result).not.toContain('issue-handler')
    expect(Object.keys(serverFns)).toHaveLength(1)
  })

  test('dedupes custom ids, the same way across compiler instances', async () => {
    const serverFnsById: Record<string, ServerFn> = {}

    // `generateFunctionId` gives every server fn the same id.
    function createCompiler(env: 'client' | 'server') {
      return new StartCompiler({
        env,
        ...getDefaultTestOptions(env),
        mode: 'build',
        loadModule: async () => {},
        lookupKinds: getLookupKindsForEnv(env),
        lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
        resolveId: async (id) => id,
        generateFunctionId: () => 'constant_id',
        getKnownServerFns: () => serverFnsById,
        onServerFnsById: (discovered) => {
          Object.assign(serverFnsById, discovered)
        },
      })
    }
    const files = {
      '/test/src/submit-post-formdata.tsx': `import { createServerFn } from '@tanstack/react-start'
export const greetUser = createServerFn().handler(async () => 'first')`,
      '/test/src/formdata-redirect/index.tsx': `import { createServerFn } from '@tanstack/react-start'
export const greetUser = createServerFn().handler(async () => 'second')`,
    }

    const client = createCompiler('client')
    const clientIds: Record<string, unknown> = {}
    for (const [id, code] of Object.entries(files)) {
      const { greetUser } = await evaluateModule(
        (await client.compile({ code, id }))!.code,
      )
      clientIds[id] = greetUser.rpc.client
    }
    const ids = Object.keys(serverFnsById)
    expect(ids).toHaveLength(2)
    expect(Object.values(clientIds).sort()).toEqual([...ids].sort())

    // A second compiler instance (e.g. the SSR build) gives each server fn
    // the id the first one gave it: its provider handler carries it, and the
    // SSR caller runs that handler.
    const server = createCompiler('server')
    for (const [id, code] of Object.entries(files)) {
      const ssr = (await server.compile({ code, id }))!.code
      const provider = (await server.compile({
        code,
        id: `${id}?tss-serverfn-split`,
      }))!.code
      const graph = createServerGraph({
        ssr,
        provider,
        id,
        serverFns: serverFnsById,
      })
      expect(await (await graph.ssr()).greetUser()).toBe(
        id.includes('formdata-redirect') ? 'second' : 'first',
      )
      const handlers = Object.values(await graph.provider()).filter(
        (value) => typeof value === 'function',
      )
      expect(handlers.map((handler) => handler.meta.id)).toEqual([
        clientIds[id],
      ])
    }
    expect(Object.keys(serverFnsById).sort()).toEqual([...ids].sort())
  })

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
    expect(result!.code).toContain('createClientRpc')
    expect(result!.code).not.toContain('server-only-value')
  })
})

// The server function resolver rejects client-origin calls to functions that
// are not client-referenced (`includeClientReferencedCheck`, used when SSR is
// not the provider). A server fn the client compiles is callable from the
// client, through the resolver generated from what the callers reported
// (N14).
describe('server functions discovered in caller modules', () => {
  /**
   * Compiles `code` in the caller environment `env` (the provider being a
   * separate `rsc` environment), then generates the production resolver from
   * the server fns the callers reported and links it to the provider, like
   * the server-fn router. Returns the resolver's `getServerFnById` and the
   * reported ids.
   */
  async function resolverFor(env: 'client' | 'server', code: string) {
    const reported: Record<string, ServerFn> = {}
    const options = {
      envName: env === 'client' ? 'client' : 'rsc',
      root: '/test',
      framework: 'react' as const,
      providerEnvName: 'rsc',
      mode: 'build' as const,
      loadModule: async () => {},
      lookupKinds: getLookupKindsForEnv(env),
      lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
      resolveId: async (id: string) => id,
      getKnownServerFns: () => ({}),
    }
    const caller = new StartCompiler({
      ...options,
      env,
      onServerFnsById: (serverFns) => Object.assign(reported, serverFns),
    })
    await caller.compile({ code, id: '/test/src/caller.ts' })
    const provider = await new StartCompiler({
      ...options,
      env: 'server',
      envName: 'rsc',
      lookupKinds: getLookupKindsForEnv('server'),
      lookupConfigurations: getLookupConfigurationsForEnv('server', 'react'),
    }).compile({ code, id: '/test/src/caller.ts?tss-serverfn-split' })
    const resolverId = '/test/resolver.js'
    const graph = createServerGraph({
      ssr: undefined,
      provider: provider!.code,
      id: '/test/src/caller.ts',
    })
    graph.add(
      resolverId,
      generateServerFnResolverModule({
        serverFnsById: reported,
        includeClientReferencedCheck: true,
        useStaticImports: true,
      }),
    )
    const { getServerFnById } = await graph.import(resolverId)
    return { getServerFnById, ids: Object.keys(reported) }
  }

  const greet = `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'hi')`

  test('a server fn the client compiles is callable from the client', async () => {
    const { getServerFnById, ids } = await resolverFor('client', greet)
    expect(ids).toHaveLength(1)
    const handler = await getServerFnById(ids[0], { origin: 'client' })
    expect(await handler({})).toBe('hi')
  })

  // Bug: a server-environment caller reports every server fn it compiles as
  // client-referenced (handleCreateServerFn.ts: `isClientReferenced` is true
  // for every SSR-caller compile, which an RSC environment's callers are
  // too), so the resolver's client-origin check never rejects anything.
  // Impact: with a provider other than SSR (RSC), a server fn only server
  // code uses (an RSC component, a server-only module) is callable over HTTP
  // by anyone who learns its id.
  // Source: user ruling D6 (only server fns client code references are
  // HTTP-callable); the SSR-provider build pin is in
  // known-bugs-start-compiler.test.ts.
  test.fails(
    'a server fn only a server environment compiles is not callable from the client',
    async () => {
      const { getServerFnById, ids } = await resolverFor('server', greet)
      expect(ids).toHaveLength(1)
      const handler = await getServerFnById(ids[0], { origin: 'server' })
      expect(await handler({})).toBe('hi')
      await expect(
        getServerFnById(ids[0], { origin: 'client' }),
      ).rejects.toThrow()
    },
  )

  test('require a handler function', async () => {
    await expect(
      compileFor(
        'client',
        `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler()`,
      ),
    ).rejects.toThrow(
      'createServerFn must be called with a "handler" property!',
    )
  })
})

// Builders, route files and formatting: replaces the factory and
// isomorphic-fns snapshot fixtures (N5, N6) and the `.handler(` formatting
// detection unit tests (N7).
describe('server fns of builders, route files and reformatted code', () => {
  // Source: snapshot fixture factory.tsx (N5)
  test('a server fn builder with middleware is callable as a factory', async () => {
    const compiled =
      await compileAll(`import { createServerFn, createMiddleware } from '@tanstack/react-start'
const authMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auth: 'auth' } }),
)
const adminMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { admin: 'admin' } }),
)
export const createAuthServerFn = createServerFn().middleware([authMiddleware])
const createAdminServerFn = createAuthServerFn().middleware([adminMiddleware])
export const myAuthedFn = createAuthServerFn().handler(() => {
  return 'myAuthedFn'
})
export const deleteUserFn = createAdminServerFn().handler(() => {
  return 'deleteUserFn'
})
function createFakeFn() {
  return {
    handler: (cb) => {
      return cb()
    },
  }
}
export const x = createFakeFn().handler(() => {
  return 'fakeFn'
})`)
    expect(compiled.client).not.toMatch(/['"](myAuthedFn|deleteUserFn)['"]/)
    expect(Object.keys(compiled.serverFns)).toHaveLength(2)
    const client = await evaluateModule(compiled.client)
    expect(client.myAuthedFn).toEqual({ rpc: { client: expect.any(String) } })
    expect(client.myAuthedFn.options.middleware).toHaveLength(1)
    expect(client.deleteUserFn).toEqual({
      rpc: { client: expect.any(String) },
    })
    expect(client.deleteUserFn.options.middleware).toHaveLength(2)
    expect(client.x).toBe('fakeFn')
    const provider = await evaluateProvider(compiled)
    expect([
      await callProvider(provider, 'myAuthedFn'),
      await callProvider(provider, 'deleteUserFn'),
    ]).toEqual(['myAuthedFn', 'deleteUserFn'])
  })

  // Source: snapshot fixture isomorphic-fns.tsx (N6; #8504
  // start-compiler-factories.test.ts "provider compiles env fns")
  test('a route file: the provider runs the server fns, each output runs its isomorphic branch', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { useState } from 'react'

const getEnv = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

const getServerEnv = createServerFn().handler(() => getEnv())

const getEcho = createIsomorphicFn()
  .server((input: string) => 'server received ' + input)
  .client((input) => 'client received ' + input)

const getServerEcho = createServerFn()
  .validator((input: string) => input)
  .handler(({ data }) => getEcho(data))

export const Route = createFileRoute('/isomorphic-fns')({
  component: RouteComponent,
  loader() {
    return { envOnLoad: getEnv() }
  },
})

function RouteComponent() {
  const [results, setResults] = useState<Partial<Record<string, string>>>()
  async function handleClick() {
    const [serverEnv, serverEcho] = await Promise.all([
      getServerEnv(),
      getServerEcho({ data: 'hello' }),
    ])
    setResults({ envOnClick: getEnv(), echo: getEcho('hello'), serverEnv, serverEcho })
  }
  return <button onClick={handleClick}>{JSON.stringify(results)}</button>
}`
    const stubs = {
      '@tanstack/react-router': {
        createFileRoute: () => (options: unknown) => ({ options }),
      },
      react: { useState: () => [undefined, () => {}] },
    }
    const compiled = await compileAll(code)
    expect(importSources(compiled.provider)).not.toContain('react')
    expect(await callProvider(compiled, 'getServerEnv', stubs)).toBe('server')
    expect(await callProvider(compiled, 'getServerEcho', stubs, 'hello')).toBe(
      'server received hello',
    )
    for (const [output, env] of [
      ['client', 'client'],
      ['ssr', 'server'],
    ] as const) {
      const { Route } = await evaluateModule(compiled[output], stubs)
      expect(Route.options.loader(), output).toEqual({ envOnLoad: env })
    }
  })

  // Reformatted code (Vite/Babel may move the dot to its own line) and a
  // builder from another module (TanStack/router#7280 class).
  // Replaces compiler.test.ts "handles .handler with whitespace variations"
  // and "handles whitespace between . and handler" (N7).
  describe.each<{
    where: string
    files: Record<string, string>
    head: string
  }>([
    {
      where: 'the module',
      files: {},
      head: `import { createServerFn } from '@tanstack/react-start'
const base = createServerFn()`,
    },
    {
      where: 'another module',
      files: {
        '/test/src/builder.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()`,
      },
      head: `import { base } from './builder'`,
    },
  ])('with the builder of $where', ({ where, files, head }) => {
    const calls = [
      { name: 'spaces before the call', call: '.handler  (' },
      { name: 'a newline before the call', call: '.handler\n(' },
      { name: 'a newline after the dot', call: '.\n  handler(' },
      { name: 'a tab before the call', call: '.handler\t(' },
      { name: 'a comment after the dot', call: './* c */handler(' },
    ]
    for (const { name, call } of calls) {
      // Bug: a module is only compiled when its text matches
      // `createServerFn` or `.handler(` (whitespace allowed), so with the
      // builder imported from another module, a comment between the dot and
      // `handler` hides the server fn.
      // Impact: the handler and its server-only imports ship to the client.
      // Source: N7 (TanStack/router#7280 class).
      const run =
        where === 'another module' && name === 'a comment after the dot'
          ? test.fails
          : test
      run(`a handler called with ${name} is extracted`, async () => {
        const code = `${head}
import { db } from './db.server'
export const fn = base${call}async () => db.x())`
        const compiled = await compileAll(code, { files })
        expect(importSources(compiled.client)).not.toContain('./db.server')
        expect(Object.keys(compiled.serverFns)).toHaveLength(1)
        expect(
          await callProvider(compiled, 'fn', {
            './db.server': { db: { x: () => 'x' } },
            // The provider keeps the import of the builder.
            './builder': {
              base: {
                handler: (_rpc: unknown, impl: (opts: unknown) => unknown) =>
                  Object.assign((opts: unknown) => impl(opts ?? {}), {
                    __executeServer: impl,
                  }),
              },
            },
          }),
        ).toBe('x')
      })
    }
  })
})
