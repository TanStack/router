import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { createStartCompiler as createHostCompiler } from '../src/start-compiler/host'
import {
  callProvider,
  clientOnlyError,
  compileCode,
  compileFor,
  compileServer,
  createStartCompiler,
  directivePrologue,
  evaluateModule,
  renderThingTransform,
  serverOnlyError,
  settle,
  settleAsync,
} from './regression-helpers'
import type { StartCompilerImportTransform } from '../src/types'

/** A Start factory left uncompiled: calling it fails the test. */
const uncompiled = () => {
  throw new Error('uncompiled Start factory')
}

describe('compiler handles multiple files with different kinds', () => {
  test('single compiler instance correctly processes files with different kinds in succession', async () => {
    const { compile } = createStartCompiler({ env: 'client' })
    const evaluate = async (code: string, id: string) =>
      evaluateModule((await compile(code, id))!)

    // File 1: ServerFn only
    const file1 = await evaluate(
      `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(() => 'hello')`,
      '/test/src/file1.ts',
    )
    expect(file1.fn).toEqual({ rpc: { client: expect.any(String) } })

    // File 2: Middleware only. The runtime stub's `.server()` throws, so the
    // module only evaluates without it.
    const file2 = await evaluate(
      `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware().server(({ next }) => {
  console.log('server only')
  return next()
})`,
      '/test/src/file2.ts',
    )
    expect(file2.mw).toBeDefined()

    // File 3: IsomorphicFn only
    const file3 = await evaluate(
      `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = createIsomorphicFn()
  .client(() => 'client-value')
  .server(() => 'server-value')`,
      '/test/src/file3.ts',
    )
    expect(file3.fn()).toBe('client-value')

    // File 4: ServerOnlyFn only
    const file4 = await evaluate(
      `import { createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerOnlyFn(() => 'server only value')`,
      '/test/src/file4.ts',
    )
    expect(settle(file4.fn)).toBe(serverOnlyError)

    // File 5: Mix of ServerFn and IsomorphicFn
    const file5 = await evaluate(
      `import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'
export const serverFn = createServerFn().handler(() => 'hello')
export const isoFn = createIsomorphicFn().client(() => 'client-iso')`,
      '/test/src/file5.ts',
    )
    expect(file5.serverFn).toEqual({ rpc: { client: expect.any(String) } })
    expect(file5.isoFn()).toBe('client-iso')
  })

  test('compiler works correctly when processing same kind multiple times', async () => {
    const { compile } = createStartCompiler({ env: 'client' })
    const first = await evaluateModule(
      (await compile(
        `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn1 = createIsomorphicFn().client(() => 'first')`,
        '/test/src/first.ts',
      ))!,
    )
    const second = await evaluateModule(
      (await compile(
        `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn2 = createIsomorphicFn().client(() => 'second')`,
        '/test/src/second.ts',
      ))!,
    )
    expect(first.fn1()).toBe('first')
    expect(second.fn2()).toBe('second')
    // Nothing of the first module leaks into the second.
    expect(second).not.toHaveProperty('fn1')
  })
})

describe('compiler handles external import transforms', () => {
  /** `@example/runtime` stub: `renderThing` returns the arguments it got. */
  const runtimeStubs = {
    '@example/runtime': {
      renderThing: (...args: Array<unknown>) => args,
    },
  }
  /** The argument the test transform injects (`{ injected: loadThing() }`). */
  const injected = { injected: 'loaded' }

  beforeEach(() => {
    // The injected expression reads a global, like the RSC CSS transform's
    // runtime import would.
    vi.stubGlobal('loadThing', () => 'loaded')
    return () => vi.unstubAllGlobals()
  })

  /**
   * Compiles `code` for the server with `renderThingTransform`, detected the
   * way the bundler plugins detect it. Returns the code, or `null` when the
   * module is left untouched.
   */
  function compileWithTransform(
    code: string,
    id = '/test/src/routes/card.tsx',
    options: Omit<
      Parameters<typeof createStartCompiler>[0],
      'env' | 'compilerTransforms'
    > = {},
  ) {
    return createStartCompiler({
      ...options,
      env: 'server',
      compilerTransforms: [renderThingTransform],
    }).compile(code, id)
  }

  test('runs configured direct-call transforms before server function extraction', async () => {
    const id = '/test/src/routes/card.tsx'
    const code = `
        import { createServerFn } from '@tanstack/react-start'
        import { renderThing as renderAlias } from '@example/runtime'

        const ServerCard = () => 'card'
        export const getComponent = createServerFn({ method: 'GET' }).handler(async () => {
          return renderAlias(<ServerCard />)
        })
      `

    const provider = await compileWithTransform(
      code,
      `${id}?tss-serverfn-split`,
    )
    const ssr = await compileWithTransform(code, id)

    expect(provider).not.toBeNull()
    expect(
      await callProvider(
        { id, ssr: ssr ?? code, provider: provider! },
        'getComponent',
        runtimeStubs,
      ),
    ).toEqual(['card', injected])
  })

  test('runs configured direct-call transforms for namespace imports', async () => {
    const result = await compileWithTransform(`
        import * as runtime from '@example/runtime'

        const ServerCard = () => 'card'
        export const component = runtime.renderThing(<ServerCard />)
      `)

    expect(result).not.toBeNull()
    const { component } = await evaluateModule(result!, runtimeStubs)
    expect(component).toEqual(['card', injected])
  })

  test('compiles IIFEs and curried calls in a module calling a configured transform', async () => {
    const result =
      await compileWithTransform(`import { renderThing } from '@example/runtime'
const Card = () => 'card'
export const value = (() => 1)()
export const curried = ((a: number) => (b: number) => a + b)(1)(2)
export const rendered = renderThing(<Card />)`)

    expect(result).not.toBeNull()
    const module = await evaluateModule(result!, runtimeStubs)
    expect([module.value, module.curried, module.rendered]).toEqual([
      1,
      3,
      ['card', injected],
    ])
  })

  // The other shapes (a nested call; a module without a built-in factory)
  // are pinned in known-bugs-start-compiler.test.ts.
  test('runs configured transforms on a top-level call imported through a project re-export, next to a built-in factory', async () => {
    const files: Record<string, string> = {
      '/test/src/rt.ts': `export { renderThing } from '@example/runtime'`,
    }
    const code = `import { renderThing } from './rt'
import { createServerOnlyFn } from '@tanstack/react-start'
export const only = createServerOnlyFn(() => 1)
export const rendered = renderThing('card')`
    const compilerTransforms = [renderThingTransform]
    // Created by the hosts' shared factory, as the bundler plugins do.
    const compiler = createHostCompiler({
      env: 'server',
      envName: 'ssr',
      root: '/test',
      framework: 'react',
      providerEnvName: 'ssr',
      mode: 'build',
      compilerTransforms,
      getKnownServerFns: () => ({}),
      loadModule: async (id) => {
        if (files[id] !== undefined) {
          compiler.ingestModule({ code: files[id], id })
        }
      },
      resolveId: async (id) =>
        id.startsWith('./') ? `/test/src/${id.slice(2)}.ts` : id,
    })
    const result = (
      await compiler.compile({
        code,
        id: '/test/src/routes/card.tsx',
        detectedKinds: detectKindsInCode(code, 'server', {
          compilerTransforms,
        }),
      })
    )?.code

    expect(result).toBeDefined()
    const { rendered } = await evaluateModule(result!, {
      './rt': runtimeStubs['@example/runtime'],
    })
    expect(rendered).toEqual(['card', injected])
  })

  test('does not run external transforms for shadowed import names', async () => {
    const code = `
        import { renderThing } from '@example/runtime'
        const LocalCard = () => 'local'

        export function component() {
          const renderThing = (node: React.ReactNode) => node
          return renderThing(<LocalCard />)
        }
      `
    const result = await compileWithTransform(code)

    const { component } = await evaluateModule(result ?? code, runtimeStubs)
    expect(component()).toBe('local')
  })

  // Source: @vitejs/plugin-rsc transform fixtures (per row)
  test.each([
    {
      // hoist/function-hoist-block.js: block-level functions are block scoped
      name: 'past a function declared in a nested block',
      body: `{
    function renderThing() {}
  }
  return renderThing(<Card />)`,
      transformed: true,
    },
    {
      // scope/param-default-var-hoisting.js
      name: 'in a parameter default next to a var of the same name',
      params: `element = renderThing(<Card />)`,
      body: `var renderThing = null
  return element`,
      transformed: true,
    },
    {
      // hoist/catch-binding-shadow.js
      name: 'in a try block whose catch parameter shadows it',
      body: `try {
    return renderThing(<Card />)
  } catch (renderThing) {
    return renderThing
  }`,
      transformed: true,
    },
    {
      // hoist/var-hoist-block.js
      name: 'after a var in a nested block shadows it',
      body: `if (Math.random() < 2) {
    var renderThing = (element) => [element]
  }
  return renderThing(<Card />)`,
      transformed: false,
    },
    {
      // scope/fn-decl-hoisting.js
      name: 'before a hoisted function declaration shadows it',
      body: `return renderThing(<Card />)
  function renderThing(element) {
    return [element]
  }`,
      transformed: false,
    },
    {
      // scope/catch-param.js
      name: 'in a catch block whose parameter shadows it',
      body: `try {
    throw (element) => [element]
  } catch (renderThing) {
    return renderThing(<Card />)
  }`,
      transformed: false,
    },
  ])(
    'runs external transforms on a call $name only if it reads the import',
    async ({ params = '', body, transformed }) => {
      // The top-level call keeps the module transformed in every row. Local
      // shadowing functions return their argument alone.
      const result = await compileWithTransform(`
        import { renderThing } from '@example/runtime'
        const Card = () => 'card'
        export const transformed = renderThing(<Card />)
        export function render(${params}) {
          ${body}
        }
      `)

      expect(result).not.toBeNull()
      const { render } = await evaluateModule(result!, runtimeStubs)
      expect(render()).toEqual(transformed ? ['card', injected] : ['card'])
    },
  )

  // Source: #8504 compiler.test.ts "only transforms direct calls to
  // configured bindings". A computed member named by a local variable is
  // pinned in known-bugs-start-compiler.test.ts.
  test.each([
    {
      name: '.bind()',
      code: `import { renderThing } from '@example/runtime'
const Card = () => 'card'
const component = renderThing.bind(null)
export const rendered = component(<Card />)`,
      rendered: ['card'],
    },
    {
      name: '.call()',
      code: `import { renderThing } from '@example/runtime'
export const rendered = renderThing.call(null)`,
      rendered: [],
    },
    {
      name: 'a parameter shadowing the namespace import',
      code: `import * as runtime from '@example/runtime'
const Card = () => 'card'
const component = (runtime) => runtime.renderThing(<Card />)
export const rendered = component({ renderThing: (...args) => ['local', ...args] })`,
      rendered: ['local', 'card'],
    },
  ])(
    'leaves the arguments of a call through $name alone',
    async ({ code, rendered }) => {
      const output = (await compileWithTransform(code)) ?? code
      expect((await evaluateModule(output, runtimeStubs)).rendered).toEqual(
        rendered,
      )
    },
  )

  // Source: #8504 compiler.test.ts "does not load unrelated virtual runtime
  // imports". A call named like a configured transform but imported from
  // another module is not transformed, and a module the host cannot load (a
  // virtual runtime module has no file behind it, and the Rsbuild host loads
  // compiler dependencies from the input file system) does not fail the
  // build.
  test.each([
    'export const component = renderThing(<Card />)',
    'export function component() { return renderThing(<Card />) }',
    'export const component = runtime.renderThing(<Card />)',
    'export function component() { return (runtime).renderThing(<Card />) }',
  ])('leaves unrelated virtual runtime imports alone: %s', async (body) => {
    const code = `import { renderThing } from 'virtual:rsc-runtime'
import * as runtime from 'virtual:rsc-runtime'
${body}`

    const result = await compileWithTransform(code, '/test/src/runtime.tsx', {
      host: {
        resolveId: async (id) => `\0${id}`,
        loadModule: async (id) => {
          throw new Error(`cannot load ${id}`)
        },
      },
    })

    expect(result ?? code).not.toContain('loadThing')
  })

  // The same next to a built-in Start factory, which the module still
  // compiles.
  test.each([
    {
      name: 'a top-level call next to a server fn',
      code: `import { createServerFn } from '@tanstack/react-start'
import { renderThing } from 'virtual:rsc-runtime'
const Card = () => 'card'
export const component = renderThing(<Card />)
export const fn = createServerFn().handler(async () => 'server-body')`,
    },
    {
      name: 'a nested call next to a server-only fn',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { renderThing } from 'virtual:rsc-runtime'
const Card = () => 'card'
export function component() { return renderThing(<Card />) }
export const so = createServerOnlyFn(() => 'server-body')`,
    },
  ])(
    'leaves unrelated virtual runtime imports alone: $name',
    async ({ code }) => {
      const result = await compileWithTransform(code, '/test/src/runtime.tsx', {
        host: {
          resolveId: async (id) => `\0${id}`,
          loadModule: async (id) => {
            throw new Error(`cannot load ${id}`)
          },
        },
      })

      expect(result).not.toBeNull()
      expect(result).not.toContain('loadThing')
    },
  )

  // Source: #8504 compiler.test.ts "transforms configured aliases without
  // tracing unrelated runtime calls"
  test('transforms configured aliases next to an unrelated call of the same name', async () => {
    const result = await compileWithTransform(
      `
        import { renderThing as renderCard } from '@example/runtime'
        import * as configured from '@example/runtime'
        import { renderThing } from 'virtual:rsc-runtime'
        const Card = () => 'card'
        const OtherCard = () => 'other'
        const ForeignCard = () => 'foreign'
        export const foreign = renderThing(<ForeignCard />)
        export function component() {
          return [renderCard(<Card />), (configured).renderThing(<OtherCard />)]
        }
      `,
      '/test/src/card.tsx',
      // A host that loads the unrelated module, like Vite's.
      {
        files: {
          'virtual:rsc-runtime': `export const renderThing = (...args) => args`,
        },
      },
    )

    expect(result).not.toBeNull()
    const { foreign, component } = await evaluateModule(result!, {
      ...runtimeStubs,
      'virtual:rsc-runtime': {
        renderThing: (...args: Array<unknown>) => args,
      },
    })
    expect({ foreign, component: component() }).toEqual({
      foreign: ['foreign'],
      component: [
        ['card', injected],
        ['other', injected],
      ],
    })
  })

  // A `g` flag makes `RegExp#test` stateful (`lastIndex`); detection must
  // not depend on the modules detected before.
  test('a transform whose detect pattern has the g flag runs for every module it detects', async () => {
    const calls: Array<string> = []
    const { compile } = createStartCompiler({
      env: 'server',
      compilerTransforms: [
        {
          name: 'global-detect',
          environment: 'server',
          imports: [{ libName: '@example/runtime', rootExport: 'renderThing' }],
          detect: /\brenderThing\b/g,
          transform: (candidates, context) => {
            calls.push(`${context.id}:${candidates.length}`)
          },
        },
      ],
    })
    const code = `import { renderThing } from '@example/runtime'
export const rendered = renderThing()`

    await compile(code, '/test/src/a.ts')
    await compile(code, '/test/src/b.ts')

    expect(calls).toEqual(['/test/src/a.ts:1', '/test/src/b.ts:1'])
  })
})

describe('server function provider module directives', () => {
  // Running the handler does not evaluate browser-only code of the route
  // (`window` is not defined on the server).
  test.each([
    'export const Route = { component: Page }',
    'export function Route() { return Page() }',
    'export default function Route() { return Page() }',
    'export { Page }',
    'export { Page as component }',
  ])(
    'removes browser-only dependencies of stripped exports: %s',
    async (route) => {
      const server = await compileServer(
        `import { createServerFn } from '@tanstack/react-start'
export const getMessage = createServerFn().handler(() => 'server message')
const browserState = { window }
function Page() { return browserState }
${route}`,
        { id: '/test/src/routes/message.tsx' },
      )

      expect(await callProvider(server, 'getMessage')).toBe('server message')
    },
  )

  // `export * from` is pinned in known-bugs-start-compiler.test.ts.
  test('does not load a browser-only module the stripped exports re-export', async () => {
    const server = await compileServer(
      `import { createServerFn } from '@tanstack/react-start'
export const getMessage = createServerFn().handler(() => 'server message')
export { Widget } from './browser'`,
      { id: '/test/src/routes/message.tsx' },
    )

    expect(
      await callProvider(server, 'getMessage', {
        './browser': `throw new Error('browser-only module evaluated on the server')
export const Widget = 1`,
      }),
    ).toBe('server message')
  })

  const code = `
    import { createServerFn } from '@tanstack/react-start'

    export const getMessage = createServerFn({ method: 'GET' }).handler(() => {
      return 'hello'
    })
  `

  test('does not add module directives without compiler configuration', async () => {
    const provider = await compileCode('provider', code)

    expect(provider).not.toBeNull()
    expect(directivePrologue(provider!)).not.toContain('use server-entry')
  })

  test('adds configured module directives to provider files only', async () => {
    const options = { directives: ['use server-entry'] }
    const provider = await compileCode('provider', code, options)
    const caller = await compileCode('ssr', code, options)

    expect(directivePrologue(provider!)).toContain('use server-entry')
    expect(directivePrologue(caller!)).not.toContain('use server-entry')
  })
})

test('a server fn module importing an empty module compiles', async () => {
  // `./empty` holds only whitespace, as a module of TypeScript types erased
  // by an earlier transform does. Resolving `base` (a builder in the shape of
  // a server fn) loads it.
  const { compile, serverFns } = createStartCompiler({
    env: 'client',
    files: { '/test/src/empty.ts': '   \n\t  ' },
  })

  const result =
    await compile(`import { createServerFn } from '@tanstack/react-start'
import { base } from './empty'
export const other = base.handler(async () => 'not a server fn')
export const fn = createServerFn().handler(async () => 'server-secret')`)

  expect(result).not.toBeNull()
  expect(result).not.toContain('server-secret')
  expect(Object.keys(serverFns)).toHaveLength(1)
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
    const server =
      await compileServer(`import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'

const createRandomNumber = createServerOnlyFn(() => Math.floor(Math.random() * 100))
const randomNumber = createRandomNumber()

export const personServerFn = createServerFn({ method: 'GET' })
  .handler(({ data: name }) => {
    return { name, randomNumber }
  })`)
    expect(await callProvider(server, 'personServerFn', {}, 'Ada')).toEqual({
      name: 'Ada',
      randomNumber: expect.any(Number),
    })
  })

  test('invocation of createClientOnlyFn result is not treated as a candidate', async () => {
    const { code, serverFns } = await compileFor(
      'client',
      `import { createClientOnlyFn, createServerFn } from '@tanstack/react-start'

const getWindowWidth = createClientOnlyFn(() => window.innerWidth)
export const width = getWindowWidth()

export const personServerFn = createServerFn({ method: 'GET' })
  .handler(({ data: name }) => {
    return { name }
  })`,
    )
    vi.stubGlobal('window', { innerWidth: 42 })
    try {
      const client = await evaluateModule(code!)
      expect(client.width).toBe(42)
      expect(client.personServerFn).toEqual({
        rpc: { client: Object.keys(serverFns)[0] },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('re-exported createServerOnlyFn still resolves correctly', async () => {
    // Ensure the fix doesn't break re-export chain resolution (issue #6583)
    const { compile } = createStartCompiler({
      env: 'client',
      files: {
        '@tanstack/start-client-core': `export { createServerOnlyFn } from '@tanstack/start-fn-stubs'`,
      },
    })

    const result =
      await compile(`import { createServerOnlyFn } from '@tanstack/start-client-core'
export const myFn = createServerOnlyFn(() => 'server-only-value')`)

    expect(result).not.toBeNull()
    expect(result).not.toContain('server-only-value')
    const { myFn } = await evaluateModule(result!, {
      '@tanstack/start-client-core': { createServerOnlyFn: uncompiled },
    })
    expect(settle(myFn)).toBe(serverOnlyError)
  })

  test('aliased factory is still detected as a candidate', async () => {
    // `const createSO = createServerOnlyFn` is an alias, not an invocation.
    // `createSO(() => ...)` should still be treated as ServerOnlyFn.
    const result = await compileCode(
      'client',
      `import { createServerOnlyFn } from '@tanstack/react-start'

const createSO = createServerOnlyFn
export const myFn = createSO(() => 'aliased-server-only')`,
    )

    expect(result).not.toBeNull()
    expect(result).not.toContain('aliased-server-only')
    const { myFn } = await evaluateModule(result!)
    expect(settle(myFn)).toBe(serverOnlyError)
  })
})

describe('re-export chain resolution', () => {
  // This tests the fix for https://github.com/TanStack/router/issues/6583
  // Third-party packages may import from @tanstack/start-client-core (which re-exports
  // from @tanstack/start-fn-stubs) rather than directly from @tanstack/react-start.
  // The compiler should correctly resolve these imports via the slow path.

  // Virtual module contents for simulating the re-export chain:
  // @third-party/lib -> @tanstack/start-client-core -> @tanstack/start-fn-stubs
  //
  // Note: We don't need a virtual module for @tanstack/start-fn-stubs because
  // init() hardcodes it in knownRootImports. When the slow path resolution reaches
  // that package, it uses the fast path lookup and never needs to parse the module.
  const virtualModules: Record<string, string> = {
    // The client-core package that re-exports from stubs
    '@tanstack/start-client-core': `
      export { createIsomorphicFn, createServerOnlyFn, createClientOnlyFn } from '@tanstack/start-fn-stubs'
    `,
    // A third-party package that imports from start-client-core
    '@third-party/lib': `
      import { createIsomorphicFn, createClientOnlyFn } from '@tanstack/start-client-core'

      export const getThemeData = createIsomorphicFn()
        .client(() => 'client-theme')
        .server(() => 'server-theme')

      export const initClientFeature = createClientOnlyFn(() => {
        console.log('client only initialization')
        return 'initialized'
      })
    `,
  }

  const testCases: Array<{
    env: 'client' | 'server'
    fn: string
    /** What the evaluated export returns, or the error it throws. */
    value: string
    /** Implementation code the output must not contain. */
    absent?: string
  }> = [
    {
      env: 'client',
      fn: 'createIsomorphicFn',
      value: 'client-theme',
      absent: 'server-theme',
    },
    {
      env: 'server',
      fn: 'createIsomorphicFn',
      value: 'server-theme',
      absent: 'client-theme',
    },
    {
      env: 'client',
      fn: 'createClientOnlyFn',
      value: 'initialized',
    },
    {
      env: 'server',
      fn: 'createClientOnlyFn',
      value: clientOnlyError,
      absent: 'client only initialization',
    },
  ]

  test.each(testCases)(
    'resolves $fn via re-export chain on $env',
    async ({ env, fn, value, absent }) => {
      const { compile } = createStartCompiler({
        env,
        files: {
          '@tanstack/start-client-core':
            virtualModules['@tanstack/start-client-core']!,
        },
      })
      const code = virtualModules['@third-party/lib']!

      const result = await compile(code, '@third-party/lib')

      expect(result).not.toBeNull()
      if (absent) {
        expect(result).not.toContain(absent)
      }
      const module = await evaluateModule(result!, {
        '@tanstack/start-client-core': {
          createIsomorphicFn: uncompiled,
          createClientOnlyFn: uncompiled,
        },
      })
      const exported =
        fn === 'createIsomorphicFn'
          ? module.getThemeData
          : module.initClientFeature
      expect(settle(exported)).toBe(value)
    },
  )

  test('handles deeper re-export chains', async () => {
    // Another intermediate package between the library and the stubs.
    const { compile } = createStartCompiler({
      env: 'client',
      files: {
        '@tanstack/start-client-core':
          virtualModules['@tanstack/start-client-core']!,
        '@another-intermediate/pkg': `export { createIsomorphicFn } from '@tanstack/start-client-core'`,
      },
    })

    const result = await compile(
      `import { createIsomorphicFn } from '@another-intermediate/pkg'
export const deepFn = createIsomorphicFn()
  .client(() => 'deep-client')
  .server(() => 'deep-server')`,
      '@deep-third-party/lib',
    )

    expect(result).not.toBeNull()
    expect(result).not.toContain('deep-server')
    const { deepFn } = await evaluateModule(result!, {
      '@another-intermediate/pkg': { createIsomorphicFn: uncompiled },
    })
    expect(deepFn()).toBe('deep-client')
  })

  test.each([
    {
      name: 'named re-export cycle',
      virtualModules: {
        './factory-a': `
          export { createServerOnlyFn } from './factory-b'
        `,
        './factory-b': `
          export { createServerOnlyFn } from './factory-a'
        `,
      },
    },
    {
      name: 'import alias cycle',
      virtualModules: {
        './factory-a': `
          import { createServerOnlyFn } from './factory-b'
          export { createServerOnlyFn }
        `,
        './factory-b': `
          import { createServerOnlyFn } from './factory-a'
          export { createServerOnlyFn }
        `,
      },
    },
    {
      name: 'export-star cycle',
      virtualModules: {
        './factory-a': `
          export * from './factory-b'
        `,
        './factory-b': `
          export * from './factory-a'
        `,
      },
    },
  ])('handles circular import chain: $name', async ({ virtualModules }) => {
    // The cycle never reaches a Start factory (it cannot even link as ES
    // modules): compiling settles, with a result or an error, instead of
    // looping.
    const files = Object.fromEntries(
      Object.entries(virtualModules).map(([specifier, code]) => [
        `/test/src/${specifier.slice(2)}.ts`,
        code,
      ]),
    )
    const { compile } = createStartCompiler({ env: 'server', files })

    const settled = await Promise.race([
      compile(`import { createServerOnlyFn } from './factory-a'
export const myFn = createServerOnlyFn(() => 'server-only-value')`).then(
        () => 'settled',
        () => 'settled',
      ),
      new Promise((resolve) => setTimeout(resolve, 2_000, 'still compiling')),
    ])
    expect(settled).toBe('settled')
  })

  test('invalidateModule clears cached module resolution state', async () => {
    const files: Record<string, string> = {
      '/test/src/factory.ts': `export { createServerOnlyFn } from './factory-inner'`,
      '/test/src/factory-inner.ts': `export { createServerOnlyFn } from '@tanstack/start-fn-stubs'`,
    }
    const { compiler, compile } = createStartCompiler({ env: 'server', files })
    const source = `import { createServerOnlyFn } from './factory'
export const myFn = createServerOnlyFn(() => 'server-only-value')`
    const run = async () => {
      const { myFn } = await evaluateModule((await compile(source)) ?? source, {
        './factory': { createServerOnlyFn: uncompiled },
      })
      return settle(myFn)
    }

    expect(await run()).toBe('server-only-value')

    files['/test/src/factory-inner.ts'] =
      `export { createClientOnlyFn as createServerOnlyFn } from '@tanstack/start-fn-stubs'`
    compiler.invalidateModule('/test/src/factory-inner.ts')

    expect(await run()).toBe(clientOnlyError)
  })

  // The source module only mentions createServerFn: the factory module
  // renames createServerOnlyFn, so the kind of the aliased call is only found
  // by resolving it.
  test('recompiles aliased env-only calls in a provider whose source only mentions createServerFn', async () => {
    const files: Record<string, string> = {
      '/test/src/factory.ts': `export { createServerOnlyFn as createServerFnHmrFactory } from '@tanstack/start-fn-stubs'`,
    }
    const id = '/test/src/aliased-env-only-server-fn.ts'
    const source = `import { createServerFn } from '@tanstack/react-start'
import { createServerFnHmrFactory } from './factory'

const serverOnlyImpl = createServerFnHmrFactory(() => 'server-only-value')

export const serverFn = createServerFn().handler(async () => {
  return serverOnlyImpl()
})`
    const { compiler, compile } = createStartCompiler({
      env: 'server',
      files,
    })
    const callServerFn = async () =>
      settleAsync(async () =>
        callProvider(
          {
            id,
            ssr: (await compile(source, id)) ?? source,
            provider: (await compile(source, `${id}?tss-serverfn-split`))!,
          },
          'serverFn',
          { './factory': { createServerFnHmrFactory: uncompiled } },
        ),
      )

    expect(await callServerFn()).toBe('server-only-value')

    files['/test/src/factory.ts'] =
      `export { createClientOnlyFn as createServerFnHmrFactory } from '@tanstack/start-fn-stubs'`
    compiler.invalidateModule('/test/src/factory.ts')

    expect(await callServerFn()).toBe(clientOnlyError)
  })

  // The same with an external transform configured (e.g. the RSC CSS one).
  test('a provider with external transforms compiles aliased env-only calls of a server fn module', async () => {
    const files = {
      '/test/src/factory.ts': `export { createServerOnlyFn as makeServerOnly } from '@tanstack/start-fn-stubs'`,
    }
    const id = '/test/src/aliased.ts'
    const source = `import { createServerFn } from '@tanstack/react-start'
import { makeServerOnly } from './factory'
const impl = makeServerOnly(() => 'server-only-value')
export const serverFn = createServerFn().handler(async () => impl())`
    const { compile } = createStartCompiler({
      env: 'server',
      files,
      compilerTransforms: [renderThingTransform],
    })

    expect(
      await settleAsync(async () =>
        callProvider(
          {
            id,
            ssr: (await compile(source, id)) ?? source,
            provider: (await compile(source, `${id}?tss-serverfn-split`))!,
          },
          'serverFn',
          { './factory': { makeServerOnly: uncompiled } },
        ),
      ),
    ).toBe('server-only-value')
  })

  // A binding whose initializer reads itself (code saved mid-edit): compiling
  // settles, with a result or an error, instead of looping.
  test.each([
    `import { createServerFn } from '@tanstack/react-start'
export const fn: any = fn.handler(async () => 'x')
export const real = createServerFn().handler(async () => 'y')`,
    `import { createIsomorphicFn } from '@tanstack/react-start'
var a: any = b
var b: any = a
export const fn = a.server(() => 'x')
export const real = createIsomorphicFn().client(() => 'c')`,
  ])('compiling a self-referencing binding settles: %#', async (code) => {
    const { compile } = createStartCompiler({ env: 'client' })
    const settled = await Promise.race([
      compile(code).then(
        () => 'settled',
        () => 'settled',
      ),
      new Promise((resolve) => setTimeout(resolve, 2_000, 'still compiling')),
    ])
    expect(settled).toBe('settled')
  })
})

test('leaves unrelated SSR middleware chains to the bundler when a server function factory is present', async () => {
  const compiler = new StartCompiler({
    envName: 'ssr',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    env: 'server',
    mode: 'build',
    lookupKinds: getLookupKindsForEnv('server'),
    lookupConfigurations: getLookupConfigurationsForEnv('server', 'react'),
    getKnownServerFns: () => ({}),
    resolveId: async () => {
      throw new Error(
        'SSR host has no package import conditions for this unrelated binding',
      )
    },
    loadModule: async () => {
      throw new Error('Unexpected compiler dependency load')
    },
  })
  const code = `import { createMiddleware, createServerFn } from '@tanstack/react-start';
const middleware = createMiddleware({ type: 'function' }).server(({ next }) => next({ context: { role: 'admin' } }));
export const factory = createServerFn().middleware([middleware]);`
  const result = await compiler.compile({
    id: '/test/auth-wrapper.ts',
    code,
    detectedKinds: detectKindsInCode(code, 'server'),
  })
  // The server keeps the middleware chain as written.
  const { factory } = await evaluateModule(
    result?.code ?? code,
    {},
    { env: 'server' },
  )
  const [middleware] = factory.options.middleware
  expect(
    middleware.options.server({ next: (result: unknown) => result }),
  ).toEqual({ context: { role: 'admin' } })
})

test.each([
  `(createServerOnlyFn)(() => 'server-value')`,
  `(createIsomorphicFn)().server(() => 'server-value').client(() => 'client-value')`,
  `(createIsomorphicFn().server(() => 'server-value')).client(() => 'client-value')`,
])(
  'compiles transparent parentheses around native call chains: %s',
  async (expression) => {
    const result = await compileCode(
      'ssr',
      `import { createServerOnlyFn, createIsomorphicFn } from '@tanstack/react-start'; export const fn = ${expression}`,
      { id: '/test/src/parenthesized.ts' },
    )

    expect(result).not.toBeNull()
    const { fn } = await evaluateModule(result!)
    expect(fn()).toBe('server-value')
  },
)

test('compiles a server function through a parenthesized namespace receiver', async () => {
  const { code, serverFns } = await compileFor(
    'client',
    `import * as Start from '@tanstack/react-start'; export const fn = (Start).createServerFn().handler(() => 'private-server-body')`,
    { id: '/test/src/namespace-parenthesized.ts' },
  )
  expect(code).not.toBeNull()
  expect(code).not.toContain('private-server-body')
  expect(Object.keys(serverFns)).toHaveLength(1)
  expect((await evaluateModule(code!)).fn).toEqual({
    rpc: { client: Object.keys(serverFns)[0] },
  })
})

// Source: #8504 compiler.test.ts "preserves a shadowed parenthesized
// namespace receiver"
test('leaves a server fn of a parameter shadowing the namespace receiver alone', async () => {
  const code = `import * as Start from '@tanstack/react-start'
export function make(Start) {
  return (Start).createServerFn().handler(() => 'local-runtime-body')
}`
  const client = (await compileCode('client', code)) ?? code
  const { make } = await evaluateModule(client)
  const local = {
    createServerFn: () => ({ handler: (fn: () => string) => fn }),
  }
  expect(make(local)()).toBe('local-runtime-body')
})

// The client runtime's middleware `.server()` throws uncompiled: the module
// only evaluates without it.
test.each([
  {
    expression: `(Start).createServerOnlyFn(() => 'private-server-body')`,
    value: serverOnlyError,
  },
  {
    expression: `(Start).createIsomorphicFn().server(() => 'private-server-body').client(() => 'client-value')`,
    value: 'client-value',
  },
  {
    expression: `(Start).createMiddleware().server(() => 'private-server-body')`,
    value: undefined,
  },
])(
  'removes server-only code through a parenthesized namespace: $expression',
  async ({ expression, value }) => {
    const result = await compileCode(
      'client',
      `import * as Start from '@tanstack/react-start'; export const fn = ${expression}`,
      { id: '/test/src/namespace-builtins.ts' },
    )
    expect(result).not.toBeNull()
    expect(result).not.toContain('private-server-body')
    const { fn } = await evaluateModule(result!)
    expect(typeof fn === 'function' ? settle(fn) : undefined).toBe(value)
  },
)

describe('external compiler transforms', () => {
  test("run once each, in their order's phase", async () => {
    const calls: Array<string> = []
    const transform = (
      name: string,
      order?: 'pre' | 'post',
    ): StartCompilerImportTransform => ({
      name,
      environment: 'server',
      ...(order ? { order } : {}),
      imports: [{ libName: '@example/runtime', rootExport: name }],
      detect: new RegExp(`\\b${name}\\b`),
      transform: (candidates) => {
        calls.push(`${name}:${candidates.length}`)
      },
    })
    // `idle` is detected in the code, but nothing calls it.
    const compilerTransforms = [
      transform('late', 'post'),
      transform('early'),
      transform('idle'),
    ]
    const compiler = new StartCompiler({
      env: 'server',
      envName: 'server',
      root: '/test',
      framework: 'react',
      providerEnvName: 'server',
      lookupKinds: getLookupKindsForEnv('server', { compilerTransforms }),
      lookupConfigurations: getLookupConfigurationsForEnv('server', 'react', {
        compilerTransforms,
      }),
      getKnownServerFns: () => ({}),
      loadModule: async () => {},
      resolveId: async (id) => id,
      mode: 'build',
      compilerTransforms,
    })
    await compiler.compile({
      code: `import { late, early } from '@example/runtime'
export const a = late(1)
export const b = early(2)
export const label = 'idle'`,
      id: '/test/src/transforms.ts',
    })
    // A transform detected in the code but never called may run with no
    // candidates or not at all.
    expect(calls.filter((call) => !call.endsWith(':0'))).toEqual([
      'early:1',
      'late:1',
    ])
  })
})
