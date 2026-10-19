import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  captureConsole,
  captureThrow,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { renderRouteComponent, routerDevServer } from './dev-server'
import { boundaryRecorder, createRouterHost } from './plugin-host'
import {
  compileRouteModules,
  createRouteHmrTransform,
  createRouteLoader,
  evaluateModule,
  expectValidModules,
  head,
  importRequests,
  importSources,
  loadRoute,
  parseModule,
  renderComponent,
  routeFile,
  routeSpecifier,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import type { PluginOption } from 'vite'
import type { Config } from '../src/core/config'
import type { RouteGraph } from './plugin-host'

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

/** Whether the route module loads a module of its route lazily. */
const splitsSomething = (graph: RouteGraph) =>
  [...graph.importKinds.values()].includes('dynamic')

/** The real Vite plugins of a framework plugin instance, as Vite resolves them. */
const pluginsOf = (plugin: PluginOption) =>
  ([plugin] as Array<unknown>).flat(10).filter(Boolean) as Array<PluginOption>

// The router plugin's public Vite adapter in a real Vite dev server
// (plugin-host.ts): Vite resolves the config, orders the plugins, applies
// their hook filters and resolves and loads the emitted modules.
describe('code-splitter plugin pipeline', () => {
  it('compiles a split module the same way when its id has extra query parameters', async () => {
    const host = createRouterHost()
    const graph = await host.compile(routeSource('query'), {
      filename: 'query.tsx',
      routeId: '/query',
    })
    const emitted = [...graph.modules.keys()].filter((id) => id !== graph.id)
    expect(emitted.length).toBeGreaterThan(0)
    for (const id of emitted) {
      const [file, query] = id.split('?') as [string, string]
      expect(await host.emit(`${file}?${query}&t=123`), id).toBe(
        graph.modules.get(id),
      )
      expect(await host.emit(`${file}?t=123&${query}`), id).toBe(
        graph.modules.get(id),
      )
    }
  })

  it('compiles the modules of a route the same way after compiling another route', async () => {
    const first = { filename: 'first.tsx', routeId: '/first' }
    const fresh = await createRouterHost().compile(routeSource('first'), first)
    const reused = createRouterHost()
    await reused.compile(
      `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({ component: () => <p /> })
`,
      { filename: 'other.tsx', routeId: '/other' },
    )
    expect(fresh.modules.size).toBeGreaterThan(1)
    expect(
      (await reused.compile(routeSource('first'), first)).modules,
    ).toEqual(fresh.modules)
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
    expect([
      await route.options.loader(),
      await route.render('component'),
      await route.render('errorComponent'),
    ]).toEqual([
      { name: 'behavior' },
      '<p>behavior</p>',
      '<p>error in behavior</p>',
    ])
    // The three options load lazily, together: loading one makes the
    // others available.
    expect(await route.groups()).toEqual([
      ['component', 'errorComponent', 'loader'],
    ])
  })

  it('rejects invalid splitBehavior groupings with an error naming the option and the route file', async () => {
    expectDiagnostic(
      await captureThrow(() =>
        compileRouteModules(routeSource('invalid'), {
          filename: 'invalid.tsx',
          routeId: '/invalid',
          pluginOptions: {
            codeSplittingOptions: {
              splitBehavior: () => [['component'], ['component']],
            },
          },
        }),
      ),
      { severity: 'error', file: 'invalid.tsx', names: ['splitBehavior'] },
    )
  })

  // File names from real apps: optional segments, pathless groups and escaped dots.
  it.each([
    'src/routes/{-$locale}/changelog.tsx',
    'src/routes/(marketing)/about.tsx',
    'src/routes/api/[.]well-known/security[.]txt.tsx',
  ])('loads the split modules of %s', async (filename) => {
    const route = await loadRoute(routeSource('route'), { filename })
    await expectValidModules(route.modules)
    expect(await route.isLazy('component')).toBe(true)
    expect([route.options.loader(), await route.render('component')]).toEqual([
      { name: 'route' },
      '<p>route</p>',
    ])
  })

  // A real `@vitejs/plugin-react` instance in the Vite config, before and
  // after the router plugin.
  it('refuses @vitejs/plugin-react placed before the router plugin and accepts it after', async () => {
    const { default: react } = await import('@vitejs/plugin-react')
    await expect(
      createRouterHost({ plugins: { before: pluginsOf(react()) } }).compile(
        routeSource('order'),
      ),
    ).rejects.toThrow(/Plugin order error[\s\S]*@vitejs\/plugin-react/)
    expect(
      splitsSomething(
        await createRouterHost({
          plugins: { after: pluginsOf(react()) },
        }).compile(routeSource('order')),
      ),
    ).toBe(true)
  })

  // The other JSX plugins the router plugin must come before, named by
  // their package. (Their packages are not installed here: Vite plugins
  // with their names, ordered before the router plugin's `pre` plugins.)
  it.each([
    ['vite:react-swc:resolve-runtime', '@vitejs/plugin-react-swc'],
    ['vite:react-swc', '@vitejs/plugin-react-swc'],
    ['vite:react-oxc:config', '@vitejs/plugin-react-oxc'],
    ['vite:react-oxc:refresh-runtime', '@vitejs/plugin-react-oxc'],
  ])('refuses %s placed before the router plugin', async (name, pkg) => {
    await expect(
      createRouterHost({
        plugins: { before: [{ name, enforce: 'pre' }] },
      }).compile(routeSource('order')),
    ).rejects.toThrow(pkg)
  })

  it('refuses vite-plugin-solid placed before the router plugin of a Solid app', async () => {
    const { default: solid } = await import('vite-plugin-solid')
    const route = `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ component: () => <p>solid</p> })
`
    await expect(
      createRouterHost({
        targetFramework: 'solid',
        plugins: { before: pluginsOf(solid()) },
      }).compile(route),
    ).rejects.toThrow(/Plugin order error[\s\S]*vite-plugin-solid/)
    expect(
      splitsSomething(
        await createRouterHost({
          targetFramework: 'solid',
          plugins: { after: pluginsOf(solid()) },
        }).compile(route),
      ),
    ).toBe(true)
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
    expect(await before.render('component')).toBe('<p>before</p>')
    const after = await load(`${head}import { label } from './label'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{label.text}</p>,
})
`)
    await expectValidModules(after.modules)
    expect([after.options.loader(), await after.render('component')]).toEqual([
      'data',
      '<p>imported</p>',
    ])
  })

  // Each framework's route module imports the lazy route helpers from its
  // own router package, and no module imports another framework's router.
  // Vue routes load with the real vue-router; the Solid router cannot be
  // linked in process (its server entry is JSX source for bundlers), so the
  // Solid route is checked at compile level here and runs in real Solid
  // builds in integration/build-frameworks.test.ts.
  describe.each(['solid', 'vue'] as const)('a %s route', (framework) => {
    const routerPackage = `@tanstack/${framework}-router`
    const otherRouters = ['react', 'solid', 'vue']
      .filter((other) => other !== framework)
      .map((other) => `@tanstack/${other}-router`)
    // Route hooks return an accessor in Solid and a ref in Vue
    const read = framework === 'solid' ? 'posts()' : 'posts.value'

    it.each([
      { groupings: undefined, loaderSplit: false },
      { groupings: `[['loader'], ['component']]`, loaderSplit: true },
    ])(
      'loads its split options with groupings $groupings',
      async ({ groupings, loaderSplit }) => {
        const code = `import { createFileRoute, Outlet } from '${routerPackage}'
import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
${groupings ? `  codeSplitGroupings: ${groupings},\n` : ''}  loader: fetchPosts,
  component: PostsComponent,
})
const PostsComponent = () => {
  const posts = Route.useLoaderData()
  return <ul>{${read}.length}<Outlet /></ul>
}
`
        const { modules } = (await compileRouteModules(code, {
          targetFramework: framework,
          routeId: '/posts',
        }))
        await expectValidModules(modules)
        for (const [name, module] of Object.entries(modules)) {
          for (const other of otherRouters) {
            expect(importSources(module), name).not.toContain(other)
          }
        }
        if (framework === 'solid') {
          return
        }
        const route = await loadRoute(code, {
          targetFramework: framework,
          routeId: '/posts',
          stubs: { './posts': { fetchPosts: () => ['post'] } },
        })
        expect([
          (await route.renderRoute()).replace(/<!--.*?-->/g, ''),
          await route.isLazy('component'),
          await route.isLazy('loader'),
        ]).toEqual(['<ul>1</ul>', true, loaderSplit])
      },
    )
  })
})

// Modules the router plugin does not own pass its transform untouched, and
// behave as written, in a real app (SPEC J2.1, G15): the composed
// `tanstackRouter` plugin (route generator and code splitter, or route HMR
// when splitting is off) in a real Vite dev server, which also loads a lazy
// route file the generator registers but which is never split further.
// Only route files the generator registers are the router plugin's; a
// module mentioning or calling a route factory is not one, whatever it
// imports.
describe('modules the router plugin does not own', () => {
  const files = {
    'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>home</p> })
`,
    // A lazy route file: registered, not split further (J2.1).
    'routes/posts.lazy.tsx': `import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/posts')({
  component: () => <p>posts</p>,
  pendingComponent: () => <p>pending posts</p>,
})
`,
    // An API module of the app using router APIs, mentioning a route
    // factory in a string.
    'src/api.ts': `import { redirect } from '@tanstack/react-router'
export const docs = "call createFileRoute('/path')({ component }) in a route file"
export function guard(user: string | undefined) {
  if (!user) {
    throw redirect({ to: '/login' })
  }
  return user
}
`,
    // Code-based routes (code-splitting.md:73-75: no automatic splitting).
    'src/code-routes.tsx': `import { createRootRoute, createRoute } from '@tanstack/react-router'
import { fetchItems } from './items'
const root = createRootRoute()
export const itemsRoute = createRoute({
  getParentRoute: () => root,
  path: '/items',
  loader: () => fetchItems(),
  component: () => <p>items</p>,
  errorComponent: () => <p>items failed</p>,
})
export const routeTree = root.addChildren([itemsRoute])
`,
    'src/items.ts': `export const fetchItems = () => ['item']\n`,
    // A factory of the same name from an unrelated package.
    'src/unrelated-factory.tsx': `import { createFileRoute } from 'other-router'
export const Route = createFileRoute('/unrelated')({
  loader: () => 'unrelated data',
  component: () => <p>unrelated</p>,
})
`,
    'node_modules/other-router/package.json': `{ "name": "other-router", "type": "module", "exports": "./index.js" }\n`,
    'node_modules/other-router/index.js': `export const createFileRoute = (path) => (options) => ({ path, options })\n`,
    // A locally declared factory shadowing the router's name.
    'src/shadowed-factory.tsx': `function createFileRoute(path: string) {
  return (options: Record<string, unknown>) => ({ path, options })
}
export const Route = createFileRoute('/shadowed')({
  loader: () => 'shadowed data',
  component: () => <p>shadowed</p>,
})
`,
    // Shapes of deleted snapshot fixtures (destructuring, function as
    // parameter), in a module that is not a route.
    'src/destructuring.ts': `const thing = { foo: { bar: { destructured: 'destructured' } } }
export function test() {
  const {
    foo: {
      bar: { destructured },
    },
  } = thing
  return destructured
}
export const doubled = [1, 2].map(function double(value) {
  return value * 2
})
`,
  }
  const unowned = Object.keys(files).filter(
    (file) => file !== 'routes/index.tsx' && !file.startsWith('node_modules/'),
  )

  it.each([
    { name: 'code splitting on', autoCodeSplitting: true },
    { name: 'code splitting off (route HMR)', autoCodeSplitting: false },
  ])(
    'pass through the router plugin and behave as written ($name)',
    async ({ autoCodeSplitting }) => {
      const recorded = new Map<string, string>()
      const server = await routerDevServer({
        files,
        pluginOptions: { autoCodeSplitting },
        plugins: [boundaryRecorder(recorded)],
      })
      const api = await server.import('/src/api.ts')
      const code = await server.import('/src/code-routes.tsx')
      const unrelated = await server.import('/src/unrelated-factory.tsx')
      const shadowed = await server.import('/src/shadowed-factory.tsx')
      const destructuring = await server.import('/src/destructuring.ts')
      const lazy = await server.import('/routes/posts.lazy.tsx')
      // The router plugin left each module as it was (the router transform
      // boundary, before Vite's own transforms).
      for (const file of unowned.filter((file) => !file.endsWith('.lazy.tsx'))) {
        const id = path.join(server.root, file)
        expect(recorded.get(id), file).toBe(files[file as keyof typeof files])
      }
      // The lazy route module is not split: none of its options loads
      // from another module of the file.
      const lazyId = path.join(server.root, 'routes/posts.lazy.tsx')
      expect(
        importRequests(recorded.get(lazyId)!, lazyId).filter(
          ({ specifier }) => specifier.split('?')[0]!.endsWith('posts.lazy.tsx'),
        ),
      ).toEqual([])
      let redirected: unknown
      try {
        api.guard(undefined)
      } catch (error) {
        redirected = error
      }
      expect({
        docs: api.docs,
        guard: api.guard('user'),
        redirected: (redirected as { options?: unknown } | undefined)?.options,
        test: destructuring.test(),
        doubled: destructuring.doubled,
        unrelated: [unrelated.Route.path, unrelated.Route.options.loader()],
        shadowed: [shadowed.Route.path, shadowed.Route.options.loader()],
        items: [
          await code.itemsRoute.options.loader(),
          // Not lazy: the components are the functions the module wrote.
          'preload' in code.itemsRoute.options.component,
          'preload' in code.itemsRoute.options.errorComponent,
        ],
        lazy: 'preload' in lazy.Route.options.component,
      }).toEqual({
        docs: "call createFileRoute('/path')({ component }) in a route file",
        guard: 'user',
        redirected: expect.objectContaining({ to: '/login' }),
        test: 'destructured',
        doubled: [2, 4],
        unrelated: ['/unrelated', 'unrelated data'],
        shadowed: ['/shadowed', 'shadowed data'],
        items: [['item'], false, false],
        lazy: false,
      })
      expect([
        await renderRouteComponent(code.itemsRoute.options.component),
        await renderRouteComponent(unrelated.Route.options.component),
        await renderRouteComponent(shadowed.Route.options.component),
        await renderRouteComponent(lazy.Route.options.component),
        await renderRouteComponent(lazy.Route.options.pendingComponent),
      ]).toEqual([
        '<p>items</p>',
        '<p>unrelated</p>',
        '<p>shadowed</p>',
        '<p>posts</p>',
        '<p>pending posts</p>',
      ])
    },
  )
})

// Shape of the deleted code-splitter snapshot fixture directive-prologue. A
// directive only applies as the first statement of a module.
it('keeps the directive prologue of a route file first in every module', async () => {
  const { modules } = (await compileRouteModules(`'use client'

import { createFileRoute } from '@tanstack/react-router'

const label = 'directive preserved'

export const Route = createFileRoute('/directive')({
  loader: () => label,
  component: () => <div>{label}</div>,
  errorComponent: () => <div>error</div>,
})
`))
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
  async (hmr) => {
    const { modules } = (await compileRouteModules(
      `'use client'
'use strict'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/directive')({
  component: () => <div>page</div>,
})
`,
      { hmr },
    ))
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
  async (newline) => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({})
// 😀é${newline}/* 😀é */ export const broken = ;`
    await expect(compileRouteModules(code, { hmr: true })).rejects.toThrow(
      expect.objectContaining({
        loc: expect.objectContaining({ line: 4, column: 32 }),
      }),
    )
  },
)

// The most common root route (1,891 corpus files, V2-30): `createRootRoute()`
// without options. Through the plugin it stays a valid module that
// evaluates, and the real router renders its child through the default
// `Outlet` (SPEC J2.1, J2.7).
describe('a root route created without options', () => {
  it.each([false, true])(
    'renders its child through the default Outlet (hmr: %s)',
    async (hmr) => {
      const route = await loadRoute(
        `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
        { filename: 'routes/__root.tsx', routeId: '__root__', hmr },
      )
      await expectValidModules(route.modules)
      // Another module of the app builds the route tree on the root route.
      const app = await route.importFromRoute(`import { createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router'
import { Route } from '${routeSpecifier}'
export { RouterProvider } from '@tanstack/react-router'
const child = createRoute({
  getParentRoute: () => Route,
  path: '/',
  component: () => <p>child</p>,
})
export const router = createRouter({
  routeTree: Route.addChildren([child]),
  history: createMemoryHistory({ initialEntries: ['/'] }),
})
`)
      await app.router.load()
      expect(
        await renderComponent(app.RouterProvider, { router: app.router }),
      ).toBe('<p>child</p>')
    },
  )
})

describe('route HMR plugin without code splitting', () => {
  async function transformWith(
    options: Partial<Config> & { target: 'solid' | 'vue' },
  ) {
    const code = `
import { createFileRoute } from '@tanstack/${options.target}-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`
    return transformWithRouteHmrPlugin(code, options, routeFile('hmr'))
  }

  /** Server-rendered HTML without Vue's and Solid's hydration markers. */
  const html = (rendered: string) =>
    rendered.replace(/<!--.*?-->| data-hk="[^"]*"/g, '')

  /** Stubs of the router package of `target`. */
  const routerStubs = (target: 'solid' | 'vue') => ({
    [`@tanstack/${target}-router`]: {
      createFileRoute: () => (options: unknown) => ({ options }),
    },
  })

  it.each(['solid', 'vue'] as const)(
    'keeps a %s route valid and rendering when compiled with HMR',
    async (target) => {
      const output = await transformWith({ target })
      expect(await getModuleErrors(output)).toEqual([])
      const { Route } = await evaluateModule(output, routerStubs(target), {
        framework: target,
        importMeta: { hot: undefined },
      })
      expect(
        html(
          await renderComponent((Route as any).options.component, {}, target),
        ),
      ).toBe('<p>hmr</p>')
    },
  )

  // Source: corpus-diff, tinloof/tanstack-wsr src/types.ts (an empty type
  // import fixes TypeScript's "inferred type cannot be named" error); #8504
  // (a guard against a printer bug, yuku-toolchain/yuku#258).
  it('keeps a route with an empty type-only import valid', async () => {
    const output = (await transformWithRouteHmrPlugin(
      `import type {} from 'zod'
import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`,
      { target: 'solid' },
      routeFile('hmr'),
    ))
    expect(await getModuleErrors(output)).toEqual([])
    const { Route } = await evaluateModule(output, routerStubs('solid'), {
      framework: 'solid',
      importMeta: {
        hot: { data: {}, accept: () => {}, dispose: () => {} },
      },
    })
    expect(
      html(
        await renderComponent((Route as any).options.component, {}, 'solid'),
      ),
    ).toBe('<p>hmr</p>')
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
    const { result, diagnostics } = await captureConsole(run)
    const reported = diagnostics.some(
      ({ severity, text }) =>
        severity === 'warning' && text.includes(fileOf(result)),
    )
    return { result, reported }
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
        rendered: [loaded.options.loader(), await loaded.render('component')],
        splitOrReported: (await loaded.isLazy('component')) || reported,
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
      const rendered = [
        await (await loaded.load('loader'))(),
        await loaded.render('component'),
      ]
      let splitOrReported = reported
      if (!reported) {
        const lazy = []
        for (const option of split) {
          lazy.push(await loaded.isLazy(option))
        }
        splitOrReported = lazy.every(Boolean)
      }
      expect({ rendered, splitOrReported }).toEqual({
        rendered: expected,
        splitOrReported: true,
      })
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

  /** Warnings logged during `run`, as text. */
  async function warnings(run: () => Promise<unknown>) {
    const { diagnostics } = await captureConsole(run)
    return diagnostics
      .filter(({ severity }) => severity === 'warning')
      .map(({ text }) => text)
  }

  /**
   * Each plugin path in the host: a transform of route files registered as
   * `/made`, returning whether it split something.
   */
  const pluginPaths = {
    'code splitter': () => {
      const host = createRouterHost()
      return async (code: string, file: string) =>
        splitsSomething(
          await host.compile(code, { filename: file, routeId: '/made' }),
        )
    },
    'route HMR plugin': async (files: Array<string>) => {
      const transform = await createRouteHmrTransform(
        { target: 'react' },
        files,
      )
      return async (code: string, file: string) => {
        await transform(code, file)
        return false
      }
    },
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
      expect(await warnings(() => transform(code, file))).toEqual([])
    })
  })

  // A route the splitter does not split is reported, once per file
  // (decision D11: the user can change the pattern).
  it.each(Object.entries(factoryRoutes).slice(0, 2))(
    'built in %s is split, or reported once per file across repeated transforms',
    async (_, route) => {
      const files = [routeFile('made'), routeFile('other')]
      const transform = pluginPaths['code splitter']()
      const split = new Set<string>()
      const reported = await warnings(async () => {
        for (let edit = 0; edit < 3; edit++) {
          for (const file of files) {
            if (await transform(`${route('data')}// edit ${edit}\n`, file)) {
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
