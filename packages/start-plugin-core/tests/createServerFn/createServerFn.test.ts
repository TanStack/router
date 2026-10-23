import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import { linkWorkspacePackages } from '@tanstack/compiler-test-utils/workspace-packages'
import {
  callFromClient,
  callOnServer,
  callServerFnThroughCallers,
  compileError,
  expectCompileError,
  inPage,
  serveCase,
  serverFnUrls,
  useStartHost,
} from '../regression-helpers'
import type { Plugin } from 'vite'

// Moved: the custom-id build test (formerly :223) is in
// integration/start-compiler-build-ids.test.ts.

/**
 * A user plugin serving two virtual modules that differ only by their
 * `variant` query: the public one re-exports the factory the
 * implementation one defines. It reads its own query parameter and ignores
 * any other (a plugin of query-bearing modules does).
 */
function virtualFactories(): Plugin {
  const prefix = '\0virtual:server-fn-factory?'
  const modules: Record<string, string> = {
    public: `import { createIssueServerFn } from 'virtual:server-fn-factory?variant=implementation'
export { createIssueServerFn }`,
    implementation: `import { createServerFn } from '@tanstack/react-start'
export const createIssueServerFn = createServerFn`,
  }
  return {
    name: 'test:virtual-server-fn-factories',
    resolveId: (source) =>
      source.startsWith('virtual:server-fn-factory?') ? `\0${source}` : null,
    load: (id) => {
      if (!id.startsWith(prefix)) {
        return null
      }
      const variant = new URLSearchParams(id.slice(prefix.length)).get(
        'variant',
      )
      return variant ? (modules[variant] ?? null) : null
    },
  }
}

/**
 * A user plugin serving one virtual module by its exact id, as Vite's
 * documentation writes one (`if (id === resolvedVirtualModuleId)`): it
 * re-exports Start's factory.
 */
function exactVirtualFactory(): Plugin {
  const id = 'virtual:exact-server-fn-factory'
  return {
    name: 'test:exact-virtual-server-fn-factory',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load: (loaded) =>
      loaded === `\0${id}`
        ? `export { createServerFn as createAppServerFn } from '@tanstack/react-start'`
        : null,
  }
}

const host = useStartHost({
  plugins: [virtualFactories(), exactVirtualFactory()],
})

describe('createServerFn compiles correctly', () => {
  // A server fn without its handler (`.handler()` type-checks against the
  // real declarations, so this is input a user can write) is a compile
  // error at the server fn's line (SPEC G5). Editors count \n, \r\n, a
  // lone \r, U+2028 and U+2029 as line terminators, so the reported line
  // must count every one. Prose, frame layout and context length are free
  // (§5.7).
  test.each([
    ['\\n', '\n'],
    ['\\r\\n', '\r\n'],
    ['a lone \\r', '\r'],
    ['U+2028', ' '],
    ['U+2029', ' '],
  ])(
    'reports the location of a diagnostic with %s line endings',
    async (_name, eol) => {
      const source = [
        `import { createServerFn } from '@tanstack/react-start'`,
        `export const fn = createServerFn().handler()`,
      ].join(eol)
      const startCase = await (await host()).case({ 'module.tsx': source })
      expectCompileError(await compileError(startCase), {
        source,
        at: 'createServerFn()',
      })
    },
  )

  test('reports the location of a diagnostic deep in the module', async () => {
    const source = [
      `import { createServerFn } from '@tanstack/react-start'`,
      ...Array.from({ length: 10 }, (_, i) => `export const v${i} = ${i}`),
      `export const fn = createServerFn().handler()`,
    ].join('\n')
    const startCase = await (await host()).case({ 'module.tsx': source })
    expectCompileError(await compileError(startCase), {
      source,
      at: 'createServerFn()',
    })
  })

  // Malformed-input diagnostic control (SPEC §8, G5): destructuring a server
  // fn is a type error (tsc against the real declarations: TS2339 "Property
  // 'fn' does not exist on type 'OptionalFetcher<...>'"). It only has to
  // fail, at the declaration.
  test('rejects a destructured server fn', async () => {
    const source = `import { createServerFn } from '@tanstack/react-start'
export const { fn } = createServerFn().handler(async () => 1)`
    const startCase = await (await host()).case({ 'module.tsx': source })
    expectCompileError(await compileError(startCase), {
      source,
      at: '{ fn }',
    })
  })

  test('should not remove handler identifier bindings that are still referenced', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `import { createServerFn } from '@tanstack/react-start'
import { getUsers } from './server'

export const getUsersFn = createServerFn().handler(getUsers)
export const ref = getUsers`,
      'server.ts': `export const getUsers = async () => 'users'\n`,
    })
    expect(
      await inPage(
        served,
        `return [module.ref === (await load('server.ts')).getUsers, typeof module.getUsersFn.url]`,
      ),
    ).toEqual([true, 'string'])
    expect(await callServerFnThroughCallers(served, 'module.getUsersFn')).toBe(
      'users',
    )
  })

  test('keeps query-bearing virtual module identities distinct', async () => {
    // Two virtual modules that differ only by their query (a user plugin
    // serves them): the public one re-exports the factory the
    // implementation one defines.
    const served = await serveCase(
      await host(),
      {
        'test.ts': `import { createIssueServerFn } from 'virtual:server-fn-factory?variant=public'
export const issueServerFn = createIssueServerFn().handler(async () => 'issue-handler')`,
      },
      { file: 'test.ts' },
    )
    expect(served.code.client).not.toContain('issue-handler')
    // The client calls the server fn through an RPC, and that RPC runs the
    // handler on the server.
    expect(
      await serverFnUrls(served, 'module', { file: 'test.ts' }),
    ).toHaveLength(1)
    expect(
      await callServerFnThroughCallers(
        served,
        'module.issueServerFn',
        undefined,
        { file: 'test.ts' },
      ),
    ).toBe('issue-handler')
  })
})

// Bug: in dev, the compiler looks up a module a server fn's factory comes
// from under a derived id (the module's id with a query flag of its own
// added), which the environment then loads: a user plugin serving a
// virtual module by its exact id, as Vite documents it, does not know that
// id, so the module that defines the server fn fails to compile ("Failed to
// load url virtual:...?server-fn-module-lookup"). A build loads the
// module under its own id.
// Impact: `vite dev` cannot serve a server fn whose factory a virtual
// module of the app (or of a plugin) provides.
// Fix-agnostic: however the compiler learns the factory's provenance, the
// module compiles and its server fn works.
// Source: B2 repair (rerouting "keeps query-bearing virtual module
// identities distinct" through the public plugin).
test.fails(
  'a server fn whose factory a virtual module serves by its exact id compiles in dev',
  async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `import { createAppServerFn } from 'virtual:exact-server-fn-factory'
export const fn = createAppServerFn().handler(async () => 'virtual-factory-handler')`,
    })
    expect(served.code.client).not.toContain('virtual-factory-handler')
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe(
      'virtual-factory-handler',
    )
  },
)

describe('server fns need a handler', () => {
  // `.handler()` type-checks (tsc against the real declarations), so this
  // is a user error the compiler reports at the server fn (SPEC G5), in
  // every environment that serves the module.
  test('require a handler function', async () => {
    const source = `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler()`
    const startCase = await (await host()).case({ 'module.tsx': source })
    for (const environment of ['client', 'ssr'] as const) {
      expectCompileError(await compileError(startCase, environment), {
        source,
        at: 'createServerFn()',
      })
    }
  })
})

// Builders, route files and formatting: replaces the factory and
// isomorphic-fns snapshot fixtures (N5, N6) and the `.handler(` formatting
// detection unit tests (N7).
describe('server fns of builders, route files and reformatted code', () => {
  // Source: snapshot fixture factory.tsx (N5)
  test('a server fn builder with middleware is callable as a factory', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `import { createServerFn, createMiddleware } from '@tanstack/react-start'
const authMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auth: 'auth' } }),
)
const adminMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { admin: 'admin' } }),
)
export const createAuthServerFn = createServerFn().middleware([authMiddleware])
const createAdminServerFn = createAuthServerFn().middleware([adminMiddleware])
export const myAuthedFn = createAuthServerFn().handler(({ context }) => {
  return ['myAuthedFn', context, 'MARK_AUTHED_HANDLER_BODY'].slice(0, 2)
})
export const deleteUserFn = createAdminServerFn().handler(({ context }) => {
  return ['deleteUserFn', context, 'MARK_DELETE_HANDLER_BODY'].slice(0, 2)
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
})`,
    })
    expect(served.code.client).not.toContain('MARK_AUTHED_HANDLER_BODY')
    expect(served.code.client).not.toContain('MARK_DELETE_HANDLER_BODY')
    expect(await serverFnUrls(served)).toHaveLength(2)
    expect(await inPage(served, 'return module.x')).toBe('fakeFn')
    // Each server fn runs the middleware of its factory chain, called from
    // the client and from server code.
    const auth = { auth: 'auth' }
    const admin = { auth: 'auth', admin: 'admin' }
    expect([
      await callFromClient(served, 'module.myAuthedFn'),
      await callFromClient(served, 'module.deleteUserFn'),
    ]).toEqual([
      ['myAuthedFn', auth],
      ['deleteUserFn', admin],
    ])
    expect([
      await callOnServer(served, 'module.myAuthedFn'),
      await callOnServer(served, 'module.deleteUserFn'),
    ]).toEqual([
      ['myAuthedFn', auth],
      ['deleteUserFn', admin],
    ])
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
    const served = await serveCase(await host(), {
      'module.tsx': code,
      // The app's code rendering the route's component in the page.
      'mount.tsx': `import { createRoot } from 'react-dom/client'
import { Route } from './module'
export function mount(element: HTMLElement) {
  const Component = Route.options.component!
  createRoot(element).render(<Component />)
}
`,
    })
    // The page's click calls both server fns through their RPCs: the
    // server runs them.
    expect(
      await inPage(
        served,
        `const element = document.createElement('div')
document.body.append(element)
const { mount } = await load('mount.tsx')
mount(element)
const button = async () => {
  for (let tries = 0; tries < 200; tries++) {
    const found = element.querySelector('button')
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('the route component did not render')
}
;(await button()).click()
for (let tries = 0; tries < 500; tries++) {
  if (element.textContent) {
    const results = JSON.parse(element.textContent)
    element.remove()
    return results
  }
  await new Promise((resolve) => setTimeout(resolve, 10))
}
throw new Error('the click gave no results: ' + element.innerHTML)`,
      ),
    ).toEqual({
      envOnClick: 'client',
      echo: 'client received hello',
      serverEnv: 'server',
      serverEcho: 'server received hello',
    })
    expect(
      await inPage(served, 'return module.Route.options.loader()'),
    ).toEqual({ envOnLoad: 'client' })
    expect((await served.ssr()).Route.options.loader()).toEqual({
      envOnLoad: 'server',
    })
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
        'builder.ts': `import { createServerFn } from '@tanstack/react-start'
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
        const served = await serveCase(await host(), {
          'module.tsx': `${head}
import { db } from './db.server'
export const fn = base${call}async () => db.x())`,
          'db.server.ts': `export const db = { x: () => 'x' }\n`,
          ...files,
        })
        expectNotLoaded(await served.loads(), ['./db.server'])
        expect(await serverFnUrls(served)).toHaveLength(1)
        expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('x')
      })
    }
  })
})

describe('server fns outside the app root', () => {
  // A server fn in a module outside the Vite root (a workspace package
  // whose source the app imports, which the dev server serves from
  // `/@fs/`): the client calls it by id through Start's server entry,
  // server code calls it directly, and the client loads none of the
  // server-only modules its handler reads.
  // Source: main's tests/vite/start-compiler-utils.test.ts "preserves
  // POSIX absolute /@fs paths outside the app root" (the dev
  // server fn id encoding, an internal helper), rerouted to its outcome.
  test('dev: a server fn in a module outside the app root runs by id', async () => {
    const started = await host()
    const shared = await mkdtemp(
      path.join(path.dirname(started.root), '.start-shared-'),
    )
    try {
      // The shared package resolves Start from its own node_modules, as a
      // workspace package does
      await linkWorkspacePackages(shared, ['@tanstack/react-start'])
      await writeFile(
        path.join(shared, 'fn.ts'),
        `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const sharedFn = createServerFn().handler(async () => db.x())
`,
      )
      await writeFile(
        path.join(shared, 'db.server.ts'),
        `export const db = { x: () => 'from outside the root' }\n`,
      )
      // Every case directory is `src/cases/c<n>`, one level deep
      const specifier = path
        .relative(
          path.join(started.root, 'src/cases/c'),
          path.join(shared, 'fn'),
        )
        .split(path.sep)
        .join('/')
      const served = await serveCase(started, {
        'module.tsx': `export { sharedFn as fn } from '${specifier}'\n`,
      })
      expect(await serverFnUrls(served)).toHaveLength(1)
      expect(await callServerFnThroughCallers(served, 'module.fn')).toBe(
        'from outside the root',
      )
      expect(
        (await served.loads()).filter((loaded) => loaded.includes('db.server')),
      ).toEqual([])
    } finally {
      await rm(shared, { recursive: true, force: true })
    }
  })
})
