/**
 * Internal controls (SPEC §8, FIX-PLAN S41/S42): the Start compiler's
 * extension seams as they exist today, the external import transforms
 * (`compilerTransforms`, which react-start-rsc's CSS transform plugs into)
 * and the provider module directives (`serverFnProviderModuleDirectives`,
 * framework wiring such as Rsbuild's `use server-entry`). They test the
 * current compiler's interface, give no clause coverage and must not block
 * a rewrite that wires these differently. Acceptance is what users see:
 * RSC CSS delivery through the real transport
 * (react-start-rsc tests/integration/rsc-css.test.ts: helpers, renames,
 * namespaces, look-alikes and shadowing) and server functions that run in a
 * real RSC provider (react-start-rsc tests/integration/rsc-start-dev.test.ts).
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../../src/start-compiler/compiler'
import { createStartCompiler as createHostCompiler } from '../../src/start-compiler/host'
import {
  callProvider,
  compileCode,
  createStartCompiler,
  directivePrologue,
  evaluateModule,
  renderThingTransform,
  renderToHtml,
} from './legacy/regression-helpers'
import { getLookupConfigurationsForEnv } from '../../src/start-compiler/config'
import type { StartCompilerImportTransform } from '../../src/types'

/**
 * What a value renders: React elements (the JSX the fixtures pass to
 * `renderThing`) as their HTML, arrays item by item, other values as they
 * are.
 */
async function asHtml(value: unknown): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(value.map(asHtml))
  }
  if (typeof value === 'object' && value !== null && '$$typeof' in value) {
    return renderToHtml(value)
  }
  return value
}

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
      await asHtml(
        await callProvider(
          { id, ssr: ssr ?? code, provider: provider! },
          'getComponent',
          runtimeStubs,
        ),
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
    expect(await asHtml(component)).toEqual(['card', injected])
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
    expect(
      await asHtml([module.value, module.curried, module.rendered]),
    ).toEqual([1, 3, ['card', injected]])
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
    expect(await asHtml(rendered)).toEqual(['card', injected])
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
    expect(await asHtml(component())).toBe('local')
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
      expect(await asHtml(render())).toEqual(
        transformed ? ['card', injected] : ['card'],
      )
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
      expect(
        await asHtml((await evaluateModule(output, runtimeStubs)).rendered),
      ).toEqual(rendered)
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
    expect({
      foreign: await asHtml(foreign),
      component: await asHtml(component()),
    }).toEqual({
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
