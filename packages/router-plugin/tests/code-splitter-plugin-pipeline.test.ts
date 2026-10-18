import { describe, expect, it, vi } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import {
  compileRouteModules,
  createCodeSplitterTransforms,
  createRouteHmrTransform,
  createRouteLoader,
  evaluateModule,
  expectValidModules,
  head,
  importRequests,
  importSources,
  loadRoute,
  parseModule,
  routeFile,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import type { Config } from '../src/core/config'

const routeSource = (name: string) => `
import { createFileRoute } from '@tanstack/react-router'
const state = { name: ${JSON.stringify(name)} }
export const Route = createFileRoute('/${name}')({
  loader: () => state,
  head: () => ({ meta: [{ title: state.name }] }),
  component: () => <p>{state.name}</p>,
  errorComponent: () => <p>error in ${name}</p>,
})
`

const referencePluginName =
  'tanstack-router:code-splitter:compile-reference-file'

/** Ids of the modules of `file` a compiled module imports, by kind. */
function routeModuleRequests(code: string, file: string) {
  const requests = importRequests(code).filter(
    ({ specifier }) => specifier.split('?')[0] === file,
  )
  return {
    lazy: requests.filter((request) => request.dynamic),
    eager: requests.filter((request) => !request.dynamic),
  }
}

type Transforms = Awaited<ReturnType<typeof createCodeSplitterTransforms>>

/**
 * Compiles a route file and every module of it its output imports, like a
 * bundler: the route module, then the modules it imports lazily (split
 * chunks) and statically.
 */
function compileAll(splitter: Transforms, code: string, file: string) {
  const modules: Record<string, string | null> = {
    [file]: splitter.reference(code, file),
  }
  const queue = [modules[file]!]
  while (queue.length > 0) {
    const { lazy, eager } = routeModuleRequests(queue.shift()!, file)
    for (const { specifier } of [...lazy, ...eager]) {
      if (specifier in modules) {
        continue
      }
      const compile = specifier.includes('tsr-split=')
        ? splitter.virtual
        : splitter.shared
      modules[specifier] = compile(code, specifier)
      queue.push(modules[specifier] ?? '')
    }
  }
  return modules
}

describe('code-splitter plugin pipeline', () => {
  it('compiles a split module the same way when its id has extra query parameters', async () => {
    const file = routeFile('query')
    const code = routeSource('query')
    const splitter = await createCodeSplitterTransforms(
      {},
      { [file]: '/query' },
    )
    const { lazy, eager } = routeModuleRequests(
      splitter.reference(code, file)!,
      file,
    )
    expect(lazy.length).toBeGreaterThan(0)
    for (const { specifier } of [...lazy, ...eager]) {
      const compile = lazy.some((request) => request.specifier === specifier)
        ? splitter.virtual
        : splitter.shared
      const query = specifier.slice(file.length + 1)
      const output = compile(code, specifier)
      expect(output, specifier).toEqual(expect.any(String))
      expect(compile(code, `${file}?${query}&t=123`)).toBe(output)
      expect(compile(code, `${file}?t=123&${query}`)).toBe(output)
    }
  })

  it('compiles the modules of a route the same way after compiling another route', async () => {
    const files = {
      first: routeFile('first'),
      other: routeFile('other'),
    }
    const routes = { [files.first]: '/first', [files.other]: '/other' }
    const code = routeSource('first')
    const fresh = compileAll(
      await createCodeSplitterTransforms({}, routes),
      code,
      files.first,
    )
    const reused = await createCodeSplitterTransforms({}, routes)
    reused.reference(
      `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({ component: () => <p /> })
`,
      files.other,
    )
    expect(Object.keys(fresh).length).toBeGreaterThan(1)
    expect(compileAll(reused, code, files.first)).toEqual(fresh)
  })

  it('splits by the plugin-level splitBehavior for the route id', async () => {
    const splitBehavior: NonNullable<
      Config['codeSplittingOptions']
    >['splitBehavior'] = ({ routeId }) =>
      routeId === '/behavior'
        ? [['loader', 'component', 'errorComponent']]
        : undefined
    const route = await loadRoute(routeSource('behavior'), {
      routeId: '/behavior',
      pluginOptions: { codeSplittingOptions: { splitBehavior } },
    })
    await expectValidModules(route.modules)
    const lazy = routeModuleRequests(
      route.modules.reference!,
      route.graph.id,
    ).lazy
    // One lazy module provides the three options.
    expect(new Set(lazy.map((request) => request.specifier)).size).toBe(1)
    const evaluatedBefore = route.evaluated.length
    const values = []
    for (const option of ['loader', 'component', 'errorComponent']) {
      expect(route.isLazy(option), option).toBe(true)
      values.push(await route.load(option))
    }
    expect(route.evaluated.length).toBe(evaluatedBefore + 1)
    expect([values[0](), values[1](), values[2]()]).toEqual([
      { name: 'behavior' },
      '<p>behavior</p>',
      '<p>error in behavior</p>',
    ])
  })

  it('rejects invalid splitBehavior groupings', async () => {
    const file = routeFile('invalid')
    const splitter = await createCodeSplitterTransforms(
      {
        codeSplittingOptions: {
          splitBehavior: () => [['component'], ['component']],
        },
      },
      { [file]: '/invalid' },
    )
    // The error names the option and the route it rejects
    let error: unknown
    try {
      splitter.reference(routeSource('invalid'), file)
    } catch (thrown) {
      error = thrown
    }
    expect(String(error)).toMatch(/splitBehavior/)
    expect(String(error)).toMatch(/\/invalid\b/)
  })

  // File names from real apps: optional segments, pathless groups and escaped dots.
  it.each([
    'src/routes/{-$locale}/changelog.tsx',
    'src/routes/(marketing)/about.tsx',
    'src/routes/api/[.]well-known/security[.]txt.tsx',
  ])('loads the split modules of %s', async (filename) => {
    const route = await loadRoute(routeSource('route'), { filename })
    await expectValidModules(route.modules)
    expect(route.isLazy('component')).toBe(true)
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      [{ name: 'route' }, '<p>route</p>'],
    )
  })

  // The plugins of a real `@vitejs/plugin-react` instance, as Vite resolves
  // them, before and after the router plugin.
  it('refuses @vitejs/plugin-react placed before the router plugin and accepts it after', async () => {
    const { default: react } = await import('@vitejs/plugin-react')
    const reactPlugins = [react()].flat(Infinity).filter(Boolean) as Array<{
      name: string
    }>
    await expect(
      createCodeSplitterTransforms({}, {}, [
        ...reactPlugins,
        { name: referencePluginName },
      ]),
    ).rejects.toThrow(/Plugin order error[\s\S]*@vitejs\/plugin-react/)
    await expect(
      createCodeSplitterTransforms({}, {}, [
        { name: referencePluginName },
        ...reactPlugins,
      ]),
    ).resolves.toBeDefined()
  })

  // The other JSX plugins the router plugin must come before, named by
  // their package. (Their packages are not installed here: plugin names
  // only.)
  it.each([
    ['vite:react-swc:resolve-runtime', '@vitejs/plugin-react-swc'],
    ['vite:react-swc', '@vitejs/plugin-react-swc'],
    ['vite:react-oxc:config', '@vitejs/plugin-react-oxc'],
    ['vite:react-oxc:refresh-runtime', '@vitejs/plugin-react-oxc'],
  ])('refuses %s placed before the router plugin', async (name, pkg) => {
    await expect(
      createCodeSplitterTransforms({}, {}, [
        { name },
        { name: referencePluginName },
      ]),
    ).rejects.toThrow(pkg)
  })

  it('refuses vite-plugin-solid placed before the router plugin of a Solid app', async () => {
    const { default: solid } = await import('vite-plugin-solid')
    const solidPlugins = [solid()].flat() as Array<{ name: string }>
    await expect(
      createCodeSplitterTransforms({ target: 'solid' }, {}, [
        ...solidPlugins,
        { name: referencePluginName },
      ]),
    ).rejects.toThrow(/Plugin order error[\s\S]*vite-plugin-solid/)
    await expect(
      createCodeSplitterTransforms({ target: 'solid' }, {}, [
        { name: referencePluginName },
        ...solidPlugins,
      ]),
    ).resolves.toBeDefined()
  })

  // A dev server compiles each edit of a route file with the same plugin
  // instance.
  it('compiles an edited route like a fresh one after a version whose loader and component shared a binding', async () => {
    const load = createRouteLoader({
      stubs: { './label': { label: { text: 'imported' } } },
    })
    const before = await load(`${head}const label = { text: 'before' }
export const Route = createFileRoute('/')({
  loader: () => label,
  component: () => <p>{label.text}</p>,
})
`)
    expect((await before.load('component'))()).toBe('<p>before</p>')
    const after = await load(`${head}import { label } from './label'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{label.text}</p>,
})
`)
    await expectValidModules(after.modules)
    expect([after.options.loader(), (await after.load('component'))()]).toEqual(
      ['data', '<p>imported</p>'],
    )
  })

  // Each framework's route module imports the lazy route helpers from its
  // own router package, and no module imports another framework's router.
  describe.each(['solid', 'vue'] as const)('a %s route', (framework) => {
    const routerPackage = `@tanstack/${framework}-router`
    const otherRouters = ['react', 'solid', 'vue']
      .filter((other) => other !== framework)
      .map((other) => `@tanstack/${other}-router`)
    // Route hooks return an accessor in Solid and a ref in Vue
    const loaderData =
      framework === 'solid'
        ? { read: 'posts()', value: () => ['a'] }
        : { read: 'posts.value', value: { value: ['a'] } }

    it.each([
      { groupings: undefined, loaderSplit: false },
      { groupings: `[['loader'], ['component']]`, loaderSplit: true },
    ])(
      'loads its split options with groupings $groupings',
      async ({ groupings, loaderSplit }) => {
        const route = await loadRoute(
          `import { createFileRoute, Outlet } from '${routerPackage}'
import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
${groupings ? `  codeSplitGroupings: ${groupings},\n` : ''}  loader: fetchPosts,
  component: PostsComponent,
})
const PostsComponent = () => {
  const posts = Route.useLoaderData()
  return <ul>{${loaderData.read}.length}<Outlet /></ul>
}
`,
          {
            targetFramework: framework,
            stubs: {
              './posts': { fetchPosts: () => ['post'] },
              [routerPackage]: {
                createFileRoute: () => (options: unknown) => ({
                  options,
                  useLoaderData: () => loaderData.value,
                }),
              },
            },
          },
        )
        await expectValidModules(route.modules)
        for (const [name, code] of Object.entries(route.modules)) {
          for (const other of otherRouters) {
            expect(importSources(code), name).not.toContain(other)
          }
        }
        expect(route.isLazy('component')).toBe(true)
        expect((await route.load('component'))()).toBe('<ul>1</ul>')
        expect(route.isLazy('loader')).toBe(loaderSplit)
        expect(await route.options.loader()).toEqual(['post'])
      },
    )
  })
})

describe('modules that are not route files', () => {
  it.each([
    {
      // Shape of the deleted code-splitter snapshot fixture destructuring
      name: 'a module without a route',
      code: `import thing from 'thing'

export function test() {
  const {
    foo: {
      bar: { destructured },
    },
  } = thing

  return destructured
}
`,
    },
    {
      // Shape of the deleted code-splitter snapshot fixture function-as-parameter
      name: 'a module passing named function expressions',
      code: `import * as React from 'react'
import { useMemo } from 'tan-react'

const ReactUseMemoCall = React.useMemo(function performAction() {
  return 'true'
}, [])

const UseMemoCall = useMemo(function performAction() {
  return 'true'
}, [])

console.info(ReactUseMemoCall, UseMemoCall)
`,
    },
    {
      name: 'a module mentioning a route factory in a string',
      code: `export const docs = "call createFileRoute('/path')({ component }) in a route file"
`,
    },
  ])('are left as they behave: $name', async ({ code }) => {
    const stubs = {
      thing: { default: { foo: { bar: { destructured: 'destructured' } } } },
      react: { useMemo: (create: () => unknown) => create() },
      'tan-react': { useMemo: (create: () => unknown) => create() },
    }
    /** The exports of a module, functions by what they return. */
    const evaluated = async (module: string) =>
      Object.fromEntries(
        Object.entries(await evaluateModule(module, stubs)).map(
          ([name, value]) => [
            name,
            typeof value === 'function' ? { returns: value() } : value,
          ],
        ),
      )
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      for (const hmr of [false, true]) {
        const { modules } = compileRouteModules(code, { hmr })
        // One module (nothing split), importing what the file imports,
        // valid, with the same exports and values
        expect(
          {
            modules: Object.keys(modules),
            imports: importSources(modules.reference!),
            errors: await getModuleErrors(modules.reference!),
            exports: await evaluated(modules.reference!),
          },
          `hmr: ${hmr}`,
        ).toEqual({
          modules: ['reference'],
          imports: importSources(code),
          errors: [],
          exports: await evaluated(code),
        })
      }
    } finally {
      info.mockRestore()
    }
  })
})

// Shape of the deleted code-splitter snapshot fixture directive-prologue. A
// directive only applies as the first statement of a module.
it('keeps the directive prologue of a route file first in every module', () => {
  const { modules } = compileRouteModules(`'use client'

import { createFileRoute } from '@tanstack/react-router'

const label = 'directive preserved'

export const Route = createFileRoute('/directive')({
  loader: () => label,
  component: () => <div>{label}</div>,
  errorComponent: () => <div>error</div>,
})
`)
  expect(Object.keys(modules).length).toBeGreaterThan(1)
  for (const [name, code] of Object.entries(modules)) {
    const [first] = parseModule(code).body
    expect(
      first?.type === 'ExpressionStatement' ? first.directive : undefined,
      name,
    ).toBe('use client')
  }
})

// Source: #8504 router-utils prepend-statements.test.ts ("inserts after the
// complete prologue"), at compiler level: the route HMR code and the
// splitter's imports go after the whole prologue.
it.each([false, true])(
  'keeps the whole directive prologue first (hmr: %s)',
  (hmr) => {
    const { modules } = compileRouteModules(
      `'use client'
'use strict'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/directive')({
  component: () => <div>page</div>,
})
`,
      { hmr },
    )
    const prologue = (code: string) => {
      const directives: Array<string> = []
      for (const statement of parseModule(code).body) {
        if (statement.type !== 'ExpressionStatement' || !statement.directive) {
          break
        }
        directives.push(statement.directive)
      }
      return directives
    }
    expect(prologue(modules.reference!)).toEqual(['use client', 'use strict'])
  },
)

// Source: #8504 router-utils diagnostics.test.ts ("reports actionable syntax
// locations"), at plugin level. Bundlers name the file of a plugin error;
// the plugin reports where in it the error is.
it.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])(
  'reports the line and column of a syntax error in a route file with %j line endings and Unicode source',
  (newline) => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({})
// 😀é${newline}/* 😀é */ export const broken = ;`
    expect(() => compileRouteModules(code, { hmr: true })).toThrow(
      expect.objectContaining({
        loc: expect.objectContaining({ line: 4, column: 32 }),
      }),
    )
  },
)

describe('route HMR plugin without code splitting', () => {
  function transformWith(
    options: Partial<Config> & { target: 'solid' | 'vue' },
  ) {
    const code = `
import { createFileRoute } from '@tanstack/${options.target}-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`
    return transformWithRouteHmrPlugin(code, options, {
      file: routeFile('hmr'),
      routeId: '/hmr',
    })
  }

  /** Stubs of the router package of `target`. */
  const routerStubs = (target: 'solid' | 'vue') => ({
    [`@tanstack/${target}-router`]: {
      createFileRoute: () => (options: unknown) => ({ options }),
    },
  })

  it.each(['solid', 'vue'] as const)(
    'keeps a %s route valid and rendering when compiled with HMR',
    async (target) => {
      const output = transformWith({ target })
      expect(await getModuleErrors(output)).toEqual([])
      const { Route } = await evaluateModule(output, routerStubs(target), {
        importMeta: { hot: undefined },
      })
      expect((Route as any).options.component()).toBe('<p>hmr</p>')
    },
  )

  // Source: corpus-diff, tinloof/tanstack-wsr src/types.ts (an empty type
  // import fixes TypeScript's "inferred type cannot be named" error); #8504
  // (a guard against a printer bug, yuku-toolchain/yuku#258).
  it('keeps a route with an empty type-only import valid', async () => {
    const output = transformWithRouteHmrPlugin(
      `import type {} from 'zod'
import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`,
      { target: 'solid' },
      { file: routeFile('hmr'), routeId: '/hmr' },
    )
    expect(await getModuleErrors(output)).toEqual([])
    const { Route } = await evaluateModule(output, routerStubs('solid'), {
      importMeta: {
        hot: { data: {}, accept: () => {}, dispose: () => {} },
      },
    })
    expect((Route as any).options.component()).toBe('<p>hmr</p>')
  })

  // A Solid or Vue route hot-updated through the bundler's hot API:
  // integration/route-hmr-browser-frameworks.test.ts (a real page).
})

// A route the route file creates inside a function of the same file (a
// helper, an IIFE) is unsupported but user-fixable (user ruling 2026-10-17,
// decision D11): it is either split like a module-scope route (and
// hot-updates in place), or left unsplit with a warning naming the file, in
// production as in development. Either way it renders correctly; silent
// wrong output, or unsplit without a warning, fails.
// Sources: #8504 (code-splitter-plugin-pipeline.test.ts); the #8504
// confidence campaign (route-factory cases 1-3 and 5, dev-hmr D1/D2).
describe('a route created inside a function', () => {
  /**
   * Runs `run` with `console.warn` captured; returns its result and whether
   * a warning named `fileOf(result)`.
   */
  async function reporting<T>(
    run: () => Promise<T>,
    fileOf: (result: T) => string,
  ) {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = await run()
      const file = fileOf(result)
      const reported = warn.mock.calls.some((args) =>
        args.map(String).join(' ').includes(file),
      )
      return { result, reported }
    } finally {
      warn.mockRestore()
    }
  }

  /** Route files whose `/made` route a function of the file creates. */
  const factoryRoutes = {
    'a helper function, with an inline component': (data: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
function makeRoute() {
  return createFileRoute('/made')({
    loader: () => '${data}',
    component: () => <p>made</p>,
  })
}
export const Route = makeRoute()
`,
    'an IIFE, with an inline component': (data: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
export const Route = (() =>
  createFileRoute('/made')({
    loader: () => '${data}',
    component: () => <p>made</p>,
  }))()
`,
    'a helper function, with a module-level component and loader': (
      data: string,
    ) => `import { createFileRoute } from '@tanstack/react-router'
function Made() {
  return <p>made</p>
}
const loader = () => '${data}'
function makeRoute() {
  return createFileRoute('/made')({ loader, component: Made })
}
export const Route = makeRoute()
`,
    'an arrow helper, with a module-level component': (data: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
function Made() {
  return <p>made</p>
}
const makeRoute = () =>
  createFileRoute('/made')({ loader: () => '${data}', component: Made })
export const Route = makeRoute()
`,
    'an IIFE, with a module-level component': (data: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
function Made() {
  return <p>made</p>
}
export const Route = (() =>
  createFileRoute('/made')({ loader: () => '${data}', component: Made }))()
`,
  }

  // A production compile.
  it.each(Object.entries(factoryRoutes))(
    'built in %s is split, or reported, and keeps working',
    async (_, route) => {
      const { result: loaded, reported } = await reporting(
        () => loadRoute(route('data'), { routeId: '/made' }),
        (loaded) => loaded.ids.reference!,
      )
      await expectValidModules(loaded.modules)
      expect({
        rendered: [loaded.options.loader(), (await loaded.load('component'))()],
        splitOrReported: loaded.isLazy('component') || reported,
      }).toEqual({ rendered: ['data', '<p>made</p>'], splitOrReported: true })
    },
  )

  // An edit of such a route in development shows its new code:
  // integration/route-hmr-browser-plugin.test.ts (a real page).

  // Bug: route options that only exist inside the factory (its parameters,
  // its locals) are split out of it as if they were module-level code: a
  // split option that closes over a parameter throws a ReferenceError, a
  // component declared in the factory leaves a chunk that exports an
  // undeclared binding, and a parameter that shadows a module-level
  // component makes the chunk render the module-level one. Leaving such
  // options unsplit with a warning naming the file is a valid fix (the
  // pattern is unsupported but user-fixable); unsplit and silent is not.
  // Source: the #8504 confidence campaign (route-factory cases 4, 5 with a
  // split loader, 6, 6b and 6c; F-21).
  // Impact: the route throws when it renders or loads, or silently renders
  // the wrong component.
  it.fails.each([
    {
      name: 'a component the factory receives, shadowing a module-level component',
      route: `function Comp() {
  return <p>module</p>
}
function makeRoute(Comp: () => unknown) {
  return createFileRoute('/made')({ loader: () => 'data', component: Comp })
}
export const Route = makeRoute(() => <p>given</p>)`,
      expected: ['data', '<p>given</p>'],
    },
    {
      name: 'a component the factory receives',
      route: `function makeRoute(Given: () => unknown) {
  return createFileRoute('/made')({ loader: () => 'data', component: Given })
}
export const Route = makeRoute(() => <p>given</p>)`,
      expected: ['data', '<p>given</p>'],
    },
    {
      name: 'a component declared inside the factory',
      route: `function makeRoute() {
  const Local = () => <p>given</p>
  return createFileRoute('/made')({ loader: () => 'data', component: Local })
}
export const Route = makeRoute()`,
      expected: ['data', '<p>given</p>'],
    },
    {
      name: 'an inline component that reads a factory parameter',
      route: `function makeRoute(label: string) {
  return createFileRoute('/made')({
    loader: () => 'data',
    component: () => <p>{label}</p>,
  })
}
export const Route = makeRoute('given')`,
      expected: ['data', '<p>given</p>'],
    },
    {
      name: 'a split loader that reads a factory parameter',
      route: `function makeRoute(label: string) {
  return createFileRoute('/made')({
    codeSplitGroupings: [['loader'], ['component']],
    loader: () => label,
    component: () => <p>made</p>,
  })
}
export const Route = makeRoute('given')`,
      expected: ['given', '<p>made</p>'],
      split: ['loader', 'component'],
    },
  ])(
    'a route built from $name renders what the factory was given, split or reported',
    async ({ route, expected, split = ['component'] }) => {
      const { result: loaded, reported } = await reporting(
        () =>
          loadRoute(
            `import { createFileRoute } from '@tanstack/react-router'
${route}
`,
            { routeId: '/made' },
          ),
        (loaded) => loaded.ids.reference!,
      )
      expect({
        rendered: [
          await (await loaded.load('loader'))(),
          (await loaded.load('component'))(),
        ],
        splitOrReported:
          split.every((option) => loaded.isLazy(option)) || reported,
      }).toEqual({ rendered: expected, splitOrReported: true })
    },
  )

  const moduleRoute = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/made')({ component: () => <p>made</p> })
`
  const moduleRouteWithCodeRouteInHelper = `import { createFileRoute, createRoute } from '@tanstack/react-router'
export function makeChild(label: string) {
  return createRoute({
    getParentRoute: () => Route,
    path: label,
    component: () => <p>{label}</p>,
  })
}
export const Route = createFileRoute('/made')({ component: () => <p>made</p> })
`

  /** Calls of `console.warn` during `run`, as text. */
  function warnings(run: () => void) {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      run()
      return warn.mock.calls.map((args) => args.map(String).join(' '))
    } finally {
      warn.mockRestore()
    }
  }

  // Each plugin path: a transform of route files registered as `/made`.
  const pluginPaths = {
    'code splitter': async (files: Array<string>) =>
      (
        await createCodeSplitterTransforms(
          {},
          Object.fromEntries(files.map((file) => [file, '/made'])),
        )
      ).reference,
    'route HMR plugin': async (files: Array<string>) =>
      createRouteHmrTransform(
        { target: 'react' },
        Object.fromEntries(files.map((file) => [file, '/made'])),
      ),
  }

  describe.each(Object.entries(pluginPaths))('through the %s', (_, create) => {
    it.each([
      ['a module-scope route', moduleRoute],
      [
        'a module-scope route next to a code route a function creates',
        moduleRouteWithCodeRouteInHelper,
      ],
    ])('is not reported for %s', async (_, code) => {
      const file = routeFile('made')
      const transform = await create([file])
      expect(warnings(() => transform(code, file))).toEqual([])
    })
  })

  // A route the splitter does not split is reported, once per file
  // (decision D11: the user can change the pattern).
  it.each(Object.entries(factoryRoutes).slice(0, 2))(
    'built in %s is split, or reported once per file across repeated transforms',
    async (_, route) => {
      const files = [routeFile('made'), routeFile('other')]
      const transform = await pluginPaths['code splitter'](files)
      const split = new Set<string>()
      const reported = warnings(() => {
        for (let edit = 0; edit < 3; edit++) {
          for (const file of files) {
            const output = transform(`${route('data')}// edit ${edit}\n`, file)
            if (output && routeModuleRequests(output, file).lazy.length > 0) {
              split.add(file)
            }
          }
        }
      })
      for (const file of files) {
        const naming = reported.filter((message) => message.includes(file))
        expect(
          split.has(file) ? naming.length === 0 : naming.length === 1,
          file,
        ).toBe(true)
      }
    },
  )
})
