/**
 * The router plugin in a real Vite pipeline (SPEC J2.1, J2.13, G4, G5,
 * G11), continued from code-splitter-plugin-pipeline.test.ts (two files, to
 * keep each within the per-file time budget): modules the router plugin
 * does not own, root routes without options, route HMR without code
 * splitting, and routes created inside a function. The public composed
 * `tanstackRouter` and the framework's Vite plugin run in a real dev server
 * (`route-app.ts`), and the page imports what the dev server serves.
 * Diagnostics are judged by content on every channel at once.
 */
import { describe, expect, it } from 'vitest'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { tanstackRouter } from '../../../src/vite'
import { createReactDevPage, renderProbe } from '../../dev-page'
import { expectValidModules, loadRoute, uncaughtErrors } from '../../route-app'
import type { Config } from '../../../src'
import type { RouteApp, RouteAppOptions } from '../../route-app'

/**
 * A virtual route config (the public `virtualRouteConfig` option) of an app
 * whose root has the route files `files` (path → route id).
 */
const routesOf = (files: Record<string, string>) =>
  ({
    type: 'root',
    file: '__root.tsx',
    children: Object.entries(files).map(([file, path]) => ({
      type: 'route',
      path,
      file,
    })),
  }) as Config['virtualRouteConfig']

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
    'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
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
      ![
        'routes/__root.tsx',
        'routes/index.tsx',
        'routes/widgets.tsx',
        'routes/posts.lazy.tsx',
      ].includes(file) && !file.startsWith('node_modules/'),
  )

  /**
   * A served module without what differs between two dev servers of the
   * same app: the app's root directory, the dependency optimizer's hash,
   * the inline source map.
   */
  const comparable = (code: string, root: string) =>
    code
      .replaceAll(root, '<root>')
      .replace(/([?&]v=)[0-9a-f]+/g, '$1<hash>')
      .replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '')

  it.each([
    { name: 'code splitting on', autoCodeSplitting: true },
    { name: 'code splitting off (route HMR)', autoCodeSplitting: false },
  ])(
    'pass through the router plugin and behave as written ($name)',
    async ({ autoCodeSplitting }) => {
      const app = await createReactDevPage({
        files,
        plugins: () => [
          tanstackRouter({
            target: 'react',
            routesDirectory: './routes',
            generatedRouteTree: './routeTree.gen.ts',
            autoCodeSplitting,
          }),
        ],
      })
      // The same app without the router plugin (the control)
      const control = await createReactDevPage({ files, plugins: () => [] })
      // The router plugin left each module as it was: the dev server
      // serves it as the same app without the router plugin does.
      for (const file of unowned) {
        expect(
          comparable(await app.transform(`/${file}`), app.root),
          file,
        ).toBe(comparable(await control.transform(`/${file}`), control.root))
      }
      // The lazy route module is not split: loading it and its options
      // requests no module but the app's own files and dependencies.
      const lazy = await app.runClient(
        '/routes/posts.lazy.tsx',
        `const { render } = await import(${JSON.stringify(renderProbe)})
const { component, pendingComponent } = module.Route.options
const rendered = [await render(component), await render(pendingComponent)]
const own = new Set(${JSON.stringify(Object.keys(files).map((file) => `/${file}`))})
const tool = /^\\/(?:@vite\\/|@react-refresh|@fs\\/|node_modules\\/|__plugin-host__\\/)/
const requests = performance.getEntriesByType('resource')
  .map((entry) => new URL(entry.name))
  .filter((url) => url.origin === location.origin)
  .map((url) => url.pathname + url.search)
  .filter((request) => !tool.test(request) && !own.has(request) && request !== ${JSON.stringify(renderProbe)})
return { lazy: 'preload' in component, rendered, requests }`,
      )
      expect(lazy.result).toEqual({
        lazy: false,
        rendered: ['<p>posts</p>', '<p>pending posts</p>'],
        requests: [],
      })
      const run = await app.runClient(
        '/src/api.ts',
        `const { render } = await import(${JSON.stringify(renderProbe)})
const api = module
const code = await import('/src/code-routes.tsx')
const unrelated = await import('/src/unrelated-factory.tsx')
const shadowed = await import('/src/shadowed-factory.tsx')
const destructuring = await import('/src/destructuring.ts')
const preview = await import('/src/route-preview.tsx')
const { widgets, Route: widgetsRoute } = await import('/routes/widgets.tsx')
let redirected
try {
  api.guard(undefined)
} catch (error) {
  redirected = error
}
return {
  values: {
    docs: api.docs,
    guard: api.guard('user'),
    redirected: { to: redirected?.options?.to },
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
    preview: [preview.Route.options.loader(), 'preload' in preview.Route.options.component],
    // The look-alike keeps its own semantics and the very function it
    // was given.
    widgets: [
      widgets.foreign.path,
      widgets.foreign.options.loader(),
      widgets.foreign.options.component === widgets.ForeignWidget,
    ],
  },
  rendered: [
    await render(code.itemsRoute.options.component),
    await render(unrelated.Route.options.component),
    await render(shadowed.Route.options.component),
    await render(preview.Route.options.component),
    await render(widgets.foreign.options.component),
    await render(widgetsRoute.options.component),
  ],
  // The route the registered file creates is the one it splits (the
  // genuine call bound to \`Route\`; SPEC J2.1).
  widgetsSplit: 'preload' in widgetsRoute.options.component,
}`,
      )
      expect(run.result).toEqual({
        values: {
          docs: "call createFileRoute('/path')({ component }) in a route file",
          guard: 'user',
          redirected: { to: '/login' },
          test: 'destructured',
          doubled: [2, 4],
          unrelated: ['/unrelated', 'unrelated data'],
          shadowed: ['/shadowed', 'shadowed data'],
          items: [['item'], false, false],
          preview: ['preview data', false],
          widgets: ['/foreign-widget', 'foreign data', true],
        },
        rendered: [
          '<p>items</p>',
          '<p>unrelated</p>',
          '<p>shadowed</p>',
          '<p>preview</p>',
          '<p>foreign widget</p>',
          '<p>widgets</p>',
        ],
        widgetsSplit: autoCodeSplitting,
      })
      expect(uncaughtErrors(run)).toEqual([])
    },
    30_000,
  )
})

// The most common root route (1,891 files of real apps): `createRootRoute()`
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
        {
          filename: 'routes/__root.tsx',
          hmr,
          files: {
            // Another module of the app builds the route tree on the root route.
            'app.tsx': `import { createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router'
import { Route } from './routes/__root'
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
`,
          },
        },
      )
      await expectValidModules(route)
      expect(
        await route.run(`const { router, RouterProvider } = await app('app.tsx')
await router.load()
return renderComponent(RouterProvider, { router })`),
      ).toBe('<p>child</p>')
    },
  )
})

describe('route HMR plugin without code splitting', () => {
  /** The composed plugin without code splitting: its route HMR plugin. */
  const hmrRoute = (code: string, target: 'solid' | 'vue') =>
    loadRoute(code, {
      targetFramework: target,
      filename: 'hmr.tsx',
      routeId: '/hmr',
      hmr: true,
      pluginOptions: { autoCodeSplitting: false },
    })

  /** Rendered HTML without Vue's comment markers. */
  const html = (rendered: string) => rendered.replace(/<!--.*?-->/g, '')

  /**
   * Asserts that the emitted module is valid and that the route it creates
   * with the real router of `target` renders its component with the real
   * framework, in the page (with the dev server's hot API).
   */
  async function expectRenders(route: RouteApp) {
    await expectValidModules(route)
    expect(html(await route.run<string>(`return render('component')`))).toBe(
      '<p>hmr</p>',
    )
  }

  it.each(['solid', 'vue'] as const)(
    'keeps a %s route valid and rendering when compiled with HMR',
    async (target) => {
      const route = await hmrRoute(
        `
import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`,
        target,
      )
      await expectRenders(route)
      // Without an HMR runtime (the dev server's SSR environment, its own
      // module runner) the module evaluates and creates its route too
      // (SPEC J3.8). Vue only: a Solid app's SSR environment needs Solid's
      // server compile (`vite-plugin-solid` with `ssr`), which this client
      // app does not configure.
      if (target === 'vue') {
        const { Route } = await route.host.importServer(route.url)
        expect(typeof Route.options.component).toBe('function')
      }
    },
  )

  // Source: real apps: tinloof/tanstack-wsr src/types.ts (an empty type
  // import fixes TypeScript's "inferred type cannot be named" error); #8504
  // (a guard against a printer bug, yuku-toolchain/yuku#258).
  it.each(['solid', 'vue'] as const)(
    'keeps a %s route with an empty type-only import valid',
    async (target) => {
      await expectRenders(
        await hmrRoute(
          `import type {} from 'zod'
import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`,
          target,
        ),
      )
    },
  )

  // A Solid or Vue route hot-updated through the bundler's hot API:
  // integration/route-hmr-browser-frameworks.test.ts (a real page).
})

// A route the route file creates inside a function of the same file (a
// helper, an IIFE) is unsupported but user-fixable (SPEC J2.10,
// J2.8): it is either split like a module-scope route (and
// hot-updates in place), or left unsplit with a warning naming the file, in
// production as in development. Either way it renders correctly; silent
// wrong output, or unsplit without a warning, fails.
// Sources: #8504 (code-splitter-plugin-pipeline.test.ts); review of #8504.
describe('a route created inside a function', () => {
  /**
   * Whether a warning on any channel names the route file (absolute or
   * project-relative: the spelling is free, SPEC §5.7), once the page
   * loaded the route's modules.
   */
  async function reported(route: RouteApp, file = 'route.tsx') {
    return (
      findDiagnostics(await route.diagnostics(), {
        severity: 'warning',
        file,
        root: route.host.root,
      }).length > 0
    )
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

  /** A route of its own dev server: a warning is due once per file. */
  const loadMade = (code: string, options: RouteAppOptions = {}) =>
    loadRoute(code, { routeId: '/made', fresh: true, ...options })

  it.each(Object.entries(factoryRoutes))(
    'built in %s is split, or reported, and keeps working',
    async (_, route) => {
      const loaded = await loadMade(route('data'))
      await expectValidModules(loaded)
      const rendered = await loaded.run(
        `return [options.loader(), await render('component')]`,
      )
      const lazy = await loaded.isLazy('component')
      expect({
        rendered,
        splitOrReported: lazy || (await reported(loaded)),
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
  // Source: review of #8504.
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
      const loaded =
        await loadMade(`import { createFileRoute } from '@tanstack/react-router'
${route}
`)
      const rendered = await loaded.run(
        `return [await (await load('loader'))(), await render('component')]`,
      )
      let splitOrReported = await reported(loaded)
      if (!splitOrReported) {
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

  /** Each plugin path of the composed plugin. */
  const pluginPaths: Record<string, RouteAppOptions> = {
    'code splitter': {},
    'route HMR plugin': {
      hmr: true,
      pluginOptions: { autoCodeSplitting: false },
    },
  }

  describe.each(Object.entries(pluginPaths))('through the %s', (_, options) => {
    it('is not reported for a module-scope route', async () => {
      const route = await loadMade(moduleRoute, {
        ...options,
        filename: 'made.tsx',
      })
      // The page loads the route and every module of it
      await route.modules()
      expect(await route.run(`return render('component')`)).toBe('<p>made</p>')
      expectNoProblems(await route.diagnostics())
    })
  })

  // A route the splitter does not split is reported, once per file
  // (SPEC J2.8: the user can change the pattern), across the edits of
  // the files of one dev server.
  it.each(Object.entries(factoryRoutes).slice(0, 2))(
    'built in %s is split, or reported once per file across repeated transforms',
    async (_, route) => {
      const version = (file: 'made' | 'other', edit: number) =>
        `${route('data').replace("'/made'", `'/${file}'`)}// edit ${edit}\n`
      const loaded = await loadMade(version('made', 0), {
        filename: 'made.tsx',
        files: { 'other.tsx': version('other', 0) },
        pluginOptions: {
          virtualRouteConfig: routesOf({
            'made.tsx': '/made',
            'other.tsx': '/other',
          }),
        },
      })
      const mark = loaded.host.diagnostics.length
      const split = new Set<string>()
      for (let edit = 0; edit < 3; edit++) {
        if (edit > 0) {
          await loaded.host.edit({
            'made.tsx': version('made', edit),
            'other.tsx': version('other', edit),
          })
        }
        // Both route files load with their split components
        const lazy = await loaded.run<
          Record<string, boolean>
        >(`let before = new Set(await compiled())
await trigger('component')
const made = (await compiled()).some((request) => !before.has(request))
const other = await app('other.tsx')
before = new Set(await compiled())
await other.Route.options.component?.preload?.()
return { made, other: (await compiled()).some((request) => !before.has(request)) }`)
        for (const [file, isSplit] of Object.entries(lazy)) {
          if (isSplit) {
            split.add(`${file}.tsx`)
          }
        }
      }
      await loaded.host.dev.idle()
      const reports = loaded.host.diagnostics.slice(mark)
      for (const file of ['made.tsx', 'other.tsx']) {
        const naming = findDiagnostics(reports, {
          severity: 'warning',
          file,
          root: loaded.host.root,
        })
        expect(
          split.has(file) ? naming.length === 0 : naming.length === 1,
          file,
        ).toBe(true)
      }
    },
    30_000,
  )
})
