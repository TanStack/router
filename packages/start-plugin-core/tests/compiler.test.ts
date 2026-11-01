/**
 * Start compiler behaviour across the modules of one app, re-export chains
 * (project modules and packages), dev edits and call-expression forms,
 * through the public Start host (`./start-host`).
 *
 * Main's tests that drove the internal compiler (one compiler instance,
 * `invalidateModule`, throwing host hooks, a synthetic `compilerTransforms`
 * hook) are not kept: the outcomes they stood for are decided here.
 */
import { describe, expect, test } from 'vitest'
import {
  callFromClient,
  callServerFnThroughCallers,
  fromPage,
  inPage,
  serveCase,
  serverFnUrls,
  settle,
  throwsError,
  useStartHost,
} from './regression-helpers'
import { shapeOf } from './page-values'
import {
  compiledLibraries,
  cycleModule,
  deeperChainModule,
  libraryChainRows,
  libraryPackages,
  reexportCycles,
} from './compiler-inputs'
import type { PageSettled } from './regression-helpers'

const host = useStartHost({
  links: ['@tanstack/start-client-core'],
  files: libraryPackages,
  config: {
    optimizeDeps: { exclude: compiledLibraries },
    ssr: { noExternal: compiledLibraries },
  },
})

/**
 * What `settle` gave in the page for the function `fn` (a page
 * expression), as the test reads it.
 */
async function settledInPage(
  served: Awaited<ReturnType<typeof serveCase>>,
  fn: string,
) {
  return fromPage(await inPage<PageSettled>(served, `return settle(${fn})`))
}

describe('several modules of one app, of different kinds, compile correctly', () => {
  test('modules with different kinds in one app', async () => {
    const started = await host()
    // File 1: ServerFn only
    const file1 = await serveCase(
      started,
      {
        'file1.ts': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(() => 'hello')`,
      },
      { file: 'file1.ts' },
    )
    expect(
      await inPage(file1, 'return typeof module.fn.url', { file: 'file1.ts' }),
    ).toBe('string')

    // File 2: Middleware only. The client middleware keeps no `.server()`.
    const file2 = await serveCase(
      started,
      {
        'file2.ts': `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware().server(({ next }) => {
  console.log('server only')
  return next()
})`,
      },
      { file: 'file2.ts' },
    )
    expect(
      await inPage(file2, 'return module.mw.options.server === undefined', {
        file: 'file2.ts',
      }),
    ).toBe(true)

    // File 3: IsomorphicFn only
    const file3 = await serveCase(
      started,
      {
        'file3.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = createIsomorphicFn()
  .client(() => 'client-value')
  .server(() => 'server-value')`,
      },
      { file: 'file3.ts' },
    )
    expect(
      await inPage(file3, 'return module.fn()', { file: 'file3.ts' }),
    ).toBe('client-value')

    // File 4: ServerOnlyFn only
    const file4 = await serveCase(
      started,
      {
        'file4.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerOnlyFn(() => 'server only value')`,
      },
      { file: 'file4.ts' },
    )
    expect(
      fromPage(
        await inPage<PageSettled>(file4, 'return settle(module.fn)', {
          file: 'file4.ts',
        }),
      ),
    ).toEqual(throwsError)

    // File 5: Mix of ServerFn and IsomorphicFn
    const file5 = await serveCase(
      started,
      {
        'file5.ts': `import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'
export const serverFn = createServerFn().handler(() => 'hello')
export const isoFn = createIsomorphicFn().client(() => 'client-iso')`,
      },
      { file: 'file5.ts' },
    )
    expect(
      await inPage(
        file5,
        'return [typeof module.serverFn.url, module.isoFn()]',
        { file: 'file5.ts' },
      ),
    ).toEqual(['string', 'client-iso'])
  })

  test('two modules of the same kind in one app', async () => {
    const started = await host()
    const first = await serveCase(
      started,
      {
        'first.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn1 = createIsomorphicFn().client(() => 'first')`,
      },
      { file: 'first.ts' },
    )
    const second = await serveCase(
      started,
      {
        'second.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn2 = createIsomorphicFn().client(() => 'second')`,
      },
      { file: 'second.ts' },
    )
    expect(
      await inPage(first, 'return module.fn1()', { file: 'first.ts' }),
    ).toBe('first')
    expect(
      await inPage(second, 'return module.fn2()', { file: 'second.ts' }),
    ).toBe('second')
  })
})

test('a server fn module importing an empty module compiles', async () => {
  // In dev, `./empty` is a file the user just emptied (only whitespace
  // left). Resolving `base` (a builder in the shape of a server fn) loads
  // it. (The module no longer links: `./empty` exports nothing. What is
  // checked is the compiler's output for it.)
  const startCase = await (
    await host()
  ).case({
    'empty.ts': '   \n\t  ',
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
import { base } from './empty'
export const other = base.handler(async () => 'not a server fn')
export const fn = createServerFn().handler(async () => 'server-secret')`,
  })
  const client = await startCase.served()
  // The server fn is extracted; the call on `base`, which is not one, is
  // left to run on the client as written.
  expect(client).not.toContain('server-secret')
  expect(client).toContain('not a server fn')
})

describe('calling result of createServerOnlyFn/createClientOnlyFn', () => {
  // This tests the fix for https://github.com/TanStack/router/issues/6643
  // When a file has both createServerFn and createServerOnlyFn, and the result
  // of createServerOnlyFn is invoked (e.g., `const result = myServerOnlyFn()`),
  // the compiler should NOT treat that invocation as a ServerOnlyFn candidate.
  // The var binding holds the RESULT of the factory, not the factory itself.

  test('invocation of createServerOnlyFn result is not treated as a candidate', async () => {
    // Compiling must not throw "createServerOnlyFn() must be called with a
    // function!", and the handler reads the value the call returned.
    const served = await serveCase(await host(), {
      'module.tsx': `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'

const createRandomNumber = createServerOnlyFn(() => Math.floor(Math.random() * 100))
const randomNumber = createRandomNumber()

export const personServerFn = createServerFn({ method: 'GET' })
  .handler(({ data: name }) => {
    return { name, randomNumber }
  })`,
    })
    expect(
      await callFromClient(served, 'module.personServerFn', 'Ada'),
    ).toEqual({ name: 'Ada', randomNumber: expect.any(Number) })
  })

  test('invocation of createClientOnlyFn result is not treated as a candidate', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `import { createClientOnlyFn, createServerFn } from '@tanstack/react-start'

const getWindowWidth = createClientOnlyFn(() => window.innerWidth)
export function readWidth() {
  const width = getWindowWidth()
  return width
}

export const personServerFn = createServerFn({ method: 'GET' })
  .handler(({ data: name }) => {
    return { name }
  })`,
    })
    expect(
      await inPage(
        served,
        'return [module.readWidth() === window.innerWidth, typeof module.personServerFn.url]',
      ),
    ).toEqual([true, 'string'])
    expect(await serverFnUrls(served)).toHaveLength(1)
  })

  test('re-exported createServerOnlyFn still resolves correctly', async () => {
    // Ensure the fix doesn't break re-export chain resolution (issue #6583):
    // the factory imported from `@tanstack/start-client-core`.
    const served = await serveCase(await host(), {
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/start-client-core'
export const myFn = createServerOnlyFn(() => 'server-only-value')`,
    })
    expect(served.code.client).not.toContain('server-only-value')
    expect(await settledInPage(served, 'module.myFn')).toEqual(throwsError)
  })

  test('aliased factory is still detected as a candidate', async () => {
    // `const createSO = createServerOnlyFn` is an alias, not an invocation.
    // `createSO(() => ...)` should still be treated as ServerOnlyFn.
    const served = await serveCase(await host(), {
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'

const createSO = createServerOnlyFn
export const myFn = createSO(() => 'aliased-server-only')`,
    })
    expect(served.code.client).not.toContain('aliased-server-only')
    expect(await settledInPage(served, 'module.myFn')).toEqual(throwsError)
  })
})

describe('re-export chain resolution', () => {
  // This tests the fix for https://github.com/TanStack/router/issues/6583
  // Third-party packages may import from @tanstack/start-client-core rather
  // than directly from @tanstack/react-start (`packages` above:
  // @third-party/lib -> @tanstack/start-client-core). The compiler should
  // correctly resolve these imports.

  test.each(libraryChainRows)(
    'resolves $fn via re-export chain on $env',
    async ({ env, fn, value, absent }) => {
      const started = await host()
      const served = await serveCase(started, {
        'module.tsx': `export { getThemeData, initClientFeature } from '@third-party/lib'\n`,
      })
      const exported =
        fn === 'createIsomorphicFn' ? 'getThemeData' : 'initClientFeature'
      if (absent) {
        const library = await started.host.transform(
          '/node_modules/@third-party/lib/index.js',
          env === 'client' ? 'client' : 'ssr',
        )
        expect(library).not.toContain(absent)
      }
      if (env === 'client') {
        expect(await settledInPage(served, `module.${exported}`)).toEqual(value)
      } else {
        const ssr = await served.ssr()
        expect(settle(ssr[exported] as () => unknown)).toEqual(value)
      }
    },
  )

  test('handles deeper re-export chains', async () => {
    // Another intermediate package between the importer and Start's package.
    const served = await serveCase(await host(), {
      'module.tsx': deeperChainModule,
    })
    expect(served.code.client).not.toContain('deep-server')
    expect(await inPage(served, 'return module.deepFn()')).toBe('deep-client')
  })

  test.each(reexportCycles)(
    'handles circular import chain: $name',
    async ({ files }) => {
      // The cycle never reaches a Start factory (it cannot even link as ES
      // modules): serving the module settles, with a result or an error,
      // instead of looping.
      const startCase = await (
        await host()
      ).case({
        ...files,
        'module.tsx': cycleModule,
      })
      const settled = await Promise.race([
        startCase.served('module.tsx', 'ssr').then(
          () => 'settled',
          () => 'settled',
        ),
        new Promise((resolve) => setTimeout(resolve, 2_000, 'still compiling')),
      ])
      expect(settled).toBe('settled')
    },
  )

  // The dev-edit concepts of this suite (an edited module a re-export
  // chain ends in recompiles its importers) are pinned through real dev
  // edits in known-bugs-start-compiler.test.ts "dev edits".

  // A binding whose initializer reads itself (code saved mid-edit): serving
  // the module settles, with a result or an error, instead of looping.
  test.each([
    `import { createServerFn } from '@tanstack/react-start'
export const fn: any = fn.handler(async () => 'x')
export const real = createServerFn().handler(async () => 'y')`,
  ])('compiling a self-referencing binding settles: %#', async (code) => {
    const startCase = await (await host()).case({ 'module.tsx': code })
    const settled = await Promise.race([
      startCase.served().then(
        () => 'settled',
        () => 'settled',
      ),
      new Promise((resolve) => setTimeout(resolve, 2_000, 'still compiling')),
    ])
    expect(settled).toBe('settled')
  })
})

test('leaves unrelated SSR middleware chains as written when a server function factory is present', async () => {
  const served = await serveCase(
    await host(),
    {
      'auth-wrapper.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start';
const middleware = createMiddleware({ type: 'function' }).server(({ next }) => next({ context: { role: 'admin' } }));
export const factory = createServerFn().middleware([middleware]);`,
      // The factory's user: a server fn of another module, whose handler
      // gives what the factory's middleware put into its context.
      'uses-factory.ts': `import { factory } from './auth-wrapper';
export const role = factory.handler(async ({ context }) => context.role);`,
    },
    { file: 'auth-wrapper.ts' },
  )
  // The server keeps the middleware chain as written: Start runs it for a
  // call of the factory's server fn, from the client (over HTTP) and from
  // server code (inside a real request).
  expect(
    await callServerFnThroughCallers(served, 'module.role', undefined, {
      file: 'uses-factory.ts',
    }),
  ).toBe('admin')
})

test.each([
  `(createServerOnlyFn)(() => 'server-value')`,
  `(createIsomorphicFn)().server(() => 'server-value').client(() => 'client-value')`,
  `(createIsomorphicFn().server(() => 'server-value')).client(() => 'client-value')`,
])(
  'compiles transparent parentheses around native call chains: %s',
  async (expression) => {
    const served = await serveCase(
      await host(),
      {
        'parenthesized.ts': `import { createServerOnlyFn, createIsomorphicFn } from '@tanstack/react-start'; export const fn = ${expression}`,
      },
      { file: 'parenthesized.ts' },
    )
    const { fn } = await served.ssr('parenthesized.ts')
    expect(fn()).toBe('server-value')
  },
)

test('compiles a server function through a parenthesized namespace receiver', async () => {
  const served = await serveCase(
    await host(),
    {
      'namespace-parenthesized.ts': `import * as Start from '@tanstack/react-start'; export const fn = (Start).createServerFn().handler(() => 'private-server-body')`,
    },
    { file: 'namespace-parenthesized.ts' },
  )
  expect(served.code.client).not.toContain('private-server-body')
  expect(
    await serverFnUrls(served, 'module', {
      file: 'namespace-parenthesized.ts',
    }),
  ).toHaveLength(1)
  expect(
    await callFromClient(served, 'module.fn', undefined, {
      file: 'namespace-parenthesized.ts',
    }),
  ).toBe('private-server-body')
})

// Source: #8504 compiler.test.ts "preserves a shadowed parenthesized
// namespace receiver"
test('leaves a server fn of a parameter shadowing the namespace receiver alone', async () => {
  const served = await serveCase(await host(), {
    'module.tsx': `import * as Start from '@tanstack/react-start'
export function make(Start) {
  return (Start).createServerFn().handler(() => 'local-runtime-body')
}`,
  })
  expect(
    await inPage(
      served,
      `const local = { createServerFn: () => ({ handler: (fn) => fn }) }
return module.make(local)()`,
    ),
  ).toBe('local-runtime-body')
})

// The client output keeps no server implementation; each export still
// evaluates to what the client runtime gives.
test.each<{
  expression: string
  /** A page script reading `module.fn`; its result is checked by `expected`. */
  script: string
  expected: unknown
}>([
  {
    expression: `(Start).createServerOnlyFn(() => 'private-server-body')`,
    script: 'return settle(module.fn)',
    expected: throwsError,
  },
  {
    expression: `(Start).createIsomorphicFn().server(() => 'private-server-body').client(() => 'client-value')`,
    script: 'return { value: module.fn() }',
    expected: 'client-value',
  },
  {
    // A real middleware (Start's runtime object, its options), whose
    // `.client()` still runs and whose `.server()` is gone.
    expression: `(Start).createMiddleware({ type: 'function' }).client(({ next }) => next({ sendContext: { from: 'client-value' } })).server(() => 'private-server-body')`,
    script: `return { value: [
  module.fn.options.type,
  module.fn.options.server === undefined,
  shapeOf(await module.fn.options.client({ next: (result) => result })),
] }`,
    expected: ['function', true, { sendContext: { from: 'client-value' } }],
  },
])(
  'removes server-only code through a parenthesized namespace: $expression',
  async ({ expression, script, expected }) => {
    const served = await serveCase(
      await host(),
      {
        'namespace-builtins.ts': `import * as Start from '@tanstack/react-start'; export const fn = ${expression}`,
      },
      { file: 'namespace-builtins.ts' },
    )
    expect(served.code.client).not.toContain('private-server-body')
    expect(
      fromPage(
        await inPage<PageSettled>(served, `${shapeOf}\n${script}`, {
          file: 'namespace-builtins.ts',
        }),
      ),
    ).toEqual(expected)
  },
)
