import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  captureConsole,
  captureThrow,
  diagnosticPosition,
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
  loadRouteGraph,
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
  // A bundler may request an emitted module with an extra cache-busting
  // parameter (`t=…`). Whatever the compiler's own ids look like (with a
  // query or not), the module the host serves under that id behaves like
  // the one it serves without it: the route loads, its options return and
  // render the same (SPEC G4, §5.3; the emitted text is free).
  it('serves a split module with the same behaviour when its id has an extra cache-busting parameter', async () => {
    const host = createRouterHost()
    const graph = await host.compile(routeSource('query'), {
      filename: 'query.tsx',
      routeId: '/query',
    })
    const emitted = [...graph.modules.keys()].filter((id) => id !== graph.id)
    expect(emitted.length).toBeGreaterThan(0)
    /** What the route does once loaded from `modules`. */
    const observe = async (modules: Map<string, string>) => {
      const route = await loadRouteGraph(
        { ...graph, modules },
        { routeId: '/query' },
      )
      return [
        await route.options.loader(),
        route.options.head(),
        await route.render('component'),
        await route.render('errorComponent'),
        await route.renderRoute(),
      ]
    }
    const expected = await observe(graph.modules)
    expect(expected).toEqual([
      { name: 'query' },
      { meta: [{ title: 'query' }] },
      '<p>query</p>',
      '<p>error in query</p>',
      '<p>query</p>',
    ])
    const busted = (id: string) =>
      id.includes('?')
        ? [`${id}&t=123`, id.replace('?', '?t=123&')]
        : [`${id}?t=123`]
    for (const id of emitted) {
      for (const requested of busted(id)) {
        const modules = new Map(graph.modules)
        modules.set(id, await host.emit(requested))
        expect(await observe(modules), requested).toEqual(expected)
      }
    }
  })

  // One plugin instance compiles every route of an app: what it emits for a
  // route does not depend on the routes it compiled before (SPEC G4). The
  // same module ids and graph, the same groups and the same behaviour;
  // the emitted text is free.
  it('compiles the modules of a route the same way after compiling another route', async () => {
    const first = { filename: 'first.tsx', routeId: '/first' }
    /** What a compiled version of the first route is and does. */
    const observe = async (graph: RouteGraph) => {
      const route = await loadRouteGraph(graph, { routeId: '/first' })
      return {
        ids: [...graph.modules.keys()],
        importKinds: Object.fromEntries(graph.importKinds),
        groups: await route.groups(),
        loader: await route.options.loader(),
        head: route.options.head(),
        component: await route.render('component'),
        errorComponent: await route.render('errorComponent'),
      }
    }
    const fresh = await captureConsole(async () =>
      observe(await createRouterHost().compile(routeSource('first'), first)),
    )
    const reused = createRouterHost()
    await reused.compile(
      `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({ component: () => <p /> })
`,
      { filename: 'other.tsx', routeId: '/other' },
    )
    const again = await captureConsole(async () =>
      observe(await reused.compile(routeSource('first'), first)),
    )
    expect(fresh.result.ids.length).toBeGreaterThan(1)
    expect(again.result).toEqual(fresh.result)
    const reported = (diagnostics: typeof fresh.diagnostics) =>
      diagnostics.map(({ severity, text }) => ({ severity, text }))
    expect(reported(again.diagnostics)).toEqual(reported(fresh.diagnostics))
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

  // The documented order: the framework's JSX plugin after the router
  // plugin, with the plugins of a real `@vitejs/plugin-react` /
  // `vite-plugin-solid` instance as Vite resolves them. The other order (a
  // correct split, or an actionable diagnostic naming the plugins, SPEC
  // G11) goes through real builds: integration/code-splitter-pragmas.test.ts.
  it.each([
    {
      name: '@vitejs/plugin-react',
      target: 'react' as const,
      plugin: async () => (await import('@vitejs/plugin-react')).default(),
      route: routeSource('order'),
    },
    {
      name: 'vite-plugin-solid',
      target: 'solid' as const,
      plugin: async () => (await import('vite-plugin-solid')).default(),
      route: `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ component: () => <p>solid</p> })
`,
    },
  ])(
    'accepts $name after the router plugin',
    async ({ target, plugin, route }) => {
      expect(
        splitsSomething(
          await createRouterHost({
            targetFramework: target,
            plugins: { after: pluginsOf(await plugin()) },
          }).compile(route),
        ),
      ).toBe(true)
    },
  )

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
        const { modules } = await compileRouteModules(code, {
          targetFramework: framework,
          routeId: '/posts',
        })
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
    // A genuine route factory call in a module the generator does not
    // register (a route built for a preview or a test, never in the route
    // tree): not a route file, so not the router plugin's.
    'src/route-preview.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => 'preview data',
  component: () => <p>preview</p>,
})
`,
    // A registered route file whose other code uses a look-alike of the
    // route factory: the same name from an unrelated package. Only the call
    // bound to `Route` is the route's (SPEC J2.1, G15; a local factory
    // shadowing the name in a route file: pinned in
    // known-bugs-code-splitter.test.ts, "look-alike route factories").
    // An unregistered module calling the genuine factory: `route-preview`.
    'routes/widgets.tsx': `import { createFileRoute } from '@tanstack/react-router'
import * as other from 'other-router'
function ForeignWidget() {
  return <p>foreign widget</p>
}
export const widgets = {
  ForeignWidget,
  foreign: other.createFileRoute('/foreign-widget')({ loader: () => 'foreign data', component: ForeignWidget }),
}
export const Route = createFileRoute('/widgets')({
  component: () => <p>widgets</p>,
})
`,
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
    (file) =>
      !['routes/index.tsx', 'routes/widgets.tsx'].includes(file) &&
      !file.startsWith('node_modules/'),
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
      const preview = await server.import('/src/route-preview.tsx')
      const { widgets, Route: widgetsRoute } =
        await server.import('/routes/widgets.tsx')
      // The router plugin left each module as it was (the router transform
      // boundary, before Vite's own transforms).
      for (const file of unowned.filter(
        (file) => !file.endsWith('.lazy.tsx'),
      )) {
        const id = path.join(server.root, file)
        expect(recorded.get(id), file).toBe(files[file as keyof typeof files])
      }
      // The lazy route module is not split: none of its options loads
      // from another module of the file.
      const lazyId = path.join(server.root, 'routes/posts.lazy.tsx')
      expect(
        importRequests(recorded.get(lazyId)!, lazyId).filter(({ specifier }) =>
          specifier.split('?')[0]!.endsWith('posts.lazy.tsx'),
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
        preview: [
          preview.Route.options.loader(),
          'preload' in preview.Route.options.component,
        ],
        // The look-alike keeps its own semantics and the very function it
        // was given.
        widgets: [
          widgets.foreign.path,
          widgets.foreign.options.loader(),
          widgets.foreign.options.component === widgets.ForeignWidget,
        ],
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
        preview: ['preview data', false],
        widgets: [
          '/foreign-widget',
          'foreign data',
          true,
        ],
      })
      expect([
        await renderRouteComponent(code.itemsRoute.options.component),
        await renderRouteComponent(unrelated.Route.options.component),
        await renderRouteComponent(shadowed.Route.options.component),
        await renderRouteComponent(lazy.Route.options.component),
        await renderRouteComponent(lazy.Route.options.pendingComponent),
        await renderRouteComponent(preview.Route.options.component),
        await renderRouteComponent(widgets.foreign.options.component),
        await renderRouteComponent(widgetsRoute.options.component),
      ]).toEqual([
        '<p>items</p>',
        '<p>unrelated</p>',
        '<p>shadowed</p>',
        '<p>posts</p>',
        '<p>pending posts</p>',
        '<p>preview</p>',
        '<p>foreign widget</p>',
        '<p>widgets</p>',
      ])
      // The route the registered file creates is the one it splits (the
      // genuine call bound to `Route`; SPEC J2.1).
      expect(
        'preload' in widgetsRoute.options.component,
      ).toBe(autoCodeSplitting)
    },
  )
})

// Shape of the deleted code-splitter snapshot fixture directive-prologue. A
// directive only applies as the first statement of a module.
it('keeps the directive prologue of a route file first in every module', async () => {
  const { modules } = await compileRouteModules(`'use client'

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
  async (hmr) => {
    const { modules } = await compileRouteModules(
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
    // The order among the directives of one prologue is free (SPEC §5.5):
    // both lead the module, each once.
    expect(prologue(modules.reference!).sort()).toEqual([
      'use client',
      'use strict',
    ])
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
    // The error points at the unexpected `;` (structured fields or a
    // rendered code frame; the wording is free).
    expectDiagnostic(
      await captureThrow(() => compileRouteModules(code, { hmr: true })),
      {
        position: diagnosticPosition(code, code.lastIndexOf(';')),
        source: code,
      },
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
      const app =
        await route.importFromRoute(`import { createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router'
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

  /** Server-rendered HTML without Vue's hydration markers. */
  const html = (rendered: string) => rendered.replace(/<!--.*?-->/g, '')

  /**
   * Asserts that the emitted module is valid and, for Vue, that the route it
   * creates with the real `@tanstack/vue-router` renders its component with
   * the real Vue. The Solid router cannot be linked in process (its server
   * entry is JSX source for bundlers): a Solid route compiled by this plugin
   * runs in a real Vite dev server page in
   * integration/route-hmr-browser-frameworks.test.ts ("vite: a solid app",
   * autoCodeSplitting: false).
   */
  async function expectRenders(
    output: string,
    target: 'solid' | 'vue',
    importMeta: Record<string, unknown>,
  ) {
    expect(await getModuleErrors(output)).toEqual([])
    if (target === 'solid') {
      return
    }
    const { Route } = await evaluateModule(
      output,
      {},
      { framework: target, importMeta },
    )
    expect(
      html(
        await renderComponent((Route as any).options.component, {}, target),
      ),
    ).toBe('<p>hmr</p>')
  }

  it.each(['solid', 'vue'] as const)(
    'keeps a %s route valid and rendering when compiled with HMR',
    async (target) => {
      await expectRenders(await transformWith({ target }), target, {
        hot: undefined,
      })
    },
  )

  // Source: corpus-diff, tinloof/tanstack-wsr src/types.ts (an empty type
  // import fixes TypeScript's "inferred type cannot be named" error); #8504
  // (a guard against a printer bug, yuku-toolchain/yuku#258).
  it.each(['solid', 'vue'] as const)(
    'keeps a %s route with an empty type-only import valid',
    async (target) => {
      const output = await transformWithRouteHmrPlugin(
        `import type {} from 'zod'
import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`,
        { target },
        routeFile('hmr'),
      )
      await expectRenders(output, target, {
        hot: { data: {}, accept: () => {}, dispose: () => {} },
      })
    },
  )

  // A Solid or Vue route hot-updated through the bundler's hot API:
  // integration/route-hmr-browser-frameworks.test.ts (a real page).
})
