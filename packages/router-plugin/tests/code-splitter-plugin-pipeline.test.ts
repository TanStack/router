/**
 * The router plugin in a real Vite pipeline (SPEC J2.1, J2.13, G4, G5, G11):
 * the public composed `tanstackRouter` and the framework's Vite plugin in a
 * real dev server (`route-app.ts`, or `dev-page.ts` for a whole app), Vite
 * resolving the config, ordering the plugins, applying their hook filters,
 * and the page importing what the dev server serves. Diagnostics are judged
 * by content on every channel at once (the error a compile throws, the
 * console, Vite's logger).
 */
import { createServerModuleRunner, parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import { runInPage } from '@tanstack/compiler-test-utils/browser'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  captureThrow,
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { tanstackRouter } from '../src/vite'
import { createReactDevPage, renderProbe } from './dev-page'
import { expectValidModules, head, holdsMarker, loadRoute } from './route-app'
import type { ESTree } from 'vite'
import type { Config } from '../src'
import type { RouteApp, RouteAppOptions } from './route-app'

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

/** The page-side description of what a module's exports are and do. */
const describeExports = `async (namespace) => {
  const described = {}
  for (const key of Object.keys(namespace).sort()) {
    const value = namespace[key]
    if (typeof value !== 'function') {
      described[key] = { value: JSON.stringify(value) }
      continue
    }
    try {
      described[key] = { rendered: await renderComponent(value) }
    } catch {
      try {
        described[key] = { returned: JSON.stringify(await value()) }
      } catch (error) {
        described[key] = { threw: String(error) }
      }
    }
  }
  return described
}`

// The router plugin's public Vite adapter in a real Vite dev server: Vite
// resolves the config, orders the plugins, applies their hook filters and
// resolves and loads the emitted modules.
describe('code-splitter plugin pipeline', () => {
  // A bundler may request an emitted module with an extra cache-busting
  // parameter (`t=…`, as Vite's HMR client does after an edit). Whatever
  // the compiler's own ids look like (with a query or not), the module the
  // host serves under that id behaves like the one it serves without it:
  // the route loads, its options return and render the same, and each
  // module's exports do the same (SPEC G4, §5.3; the emitted text is free).
  it('serves a split module with the same behaviour when its id has an extra cache-busting parameter', async () => {
    const route = await loadRoute(routeSource('query'), {
      filename: 'query.tsx',
      routeId: '/query',
    })
    expect(
      await route.run(`return [
  await options.loader(),
  options.head(),
  await render('component'),
  await render('errorComponent'),
  await renderRoute(),
]`),
    ).toEqual([
      { name: 'query' },
      { meta: [{ title: 'query' }] },
      '<p>query</p>',
      '<p>error in query</p>',
      '<p>query</p>',
    ])
    const { ids } = await route.modules()
    const emitted = Object.entries(ids)
      .filter(([label]) => label !== 'reference')
      .map(([, id]) => id)
    expect(emitted.length).toBeGreaterThan(0)
    const busted = (id: string) =>
      id.includes('?')
        ? [`${id}&t=123`, id.replace('?', '?t=123&')]
        : [`${id}?t=123`]
    for (const id of emitted) {
      for (const requested of busted(id)) {
        const [plain, again] = await route.run<Array<unknown>>(
          `const describe = ${describeExports}
return [await describe(await import(${JSON.stringify(id)})), await describe(await import(${JSON.stringify(requested)}))]`,
        )
        expect(again, requested).toEqual(plain)
      }
    }
  })

  // One plugin instance compiles every route of an app: what it emits for a
  // route does not depend on the routes it compiled before (SPEC G4). The
  // same modules, the same groups and the same behaviour, and the same
  // diagnostics; the emitted text is free.
  it('compiles the modules of a route the same way after compiling another route', async () => {
    const options: RouteAppOptions = {
      filename: 'first.tsx',
      routeId: '/first',
      // A dev server of its own each: one compiles another route first
      fresh: true,
      files: {
        'other.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({ component: () => <p /> })
`,
      },
      pluginOptions: {
        virtualRouteConfig: routesOf({
          'first.tsx': '/first',
          'other.tsx': '/other',
        }),
      },
    }
    /** What the first route is and does, and what its compile reported. */
    const observe = async (route: RouteApp) => {
      const mark = route.host.diagnostics.length
      const observed = {
        ids: (await route.modules()).ids,
        groups: await route.groups(),
        ...(await route.run<Record<string, unknown>>(`return {
  loader: await options.loader(),
  head: options.head(),
  component: await render('component'),
  errorComponent: await render('errorComponent'),
}`)),
      }
      await route.host.dev.idle()
      const reported = route.host.diagnostics
        .slice(mark)
        .map(({ severity, text }) => ({
          severity,
          text: text.replaceAll(route.host.root, '<root>'),
        }))
      return { observed, reported }
    }
    const fresh = await observe(await loadRoute(routeSource('first'), options))
    const reused = await loadRoute(routeSource('first'), options)
    // The other route of the app, compiled first (its split component too)
    await reused.host.runClient(
      '/other.tsx',
      'await module.Route.options.component.preload?.()',
    )
    const again = await observe(reused)
    expect(fresh.observed.groups).not.toEqual([])
    expect(again).toEqual(fresh)
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
      // A function option: a dev server of its own
      fresh: true,
      pluginOptions: { codeSplittingOptions: { splitBehavior } },
    })
    await expectValidModules(route)
    expect(
      await route.run(`return [
  await options.loader(),
  await render('component'),
  await render('errorComponent'),
]`),
    ).toEqual([
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
    const route = await loadRoute(routeSource('invalid'), {
      filename: 'invalid.tsx',
      routeId: '/invalid',
      fresh: true,
      pluginOptions: {
        codeSplittingOptions: {
          splitBehavior: () => [['component'], ['component']],
        },
      },
    })
    // The error the compile throws, with what every channel reported (the
    // wording and the channel are free, SPEC §5.7)
    const thrown = await captureThrow(() => route.transform())
    expectDiagnostic([...thrown, ...(await route.diagnostics())], {
      severity: 'error',
      file: 'invalid.tsx',
      root: route.host.root,
      names: ['splitBehavior'],
    })
  })

  // File names from real apps: optional segments, pathless groups and escaped dots.
  it.each([
    'src/routes/{-$locale}/changelog.tsx',
    'src/routes/(marketing)/about.tsx',
    'src/routes/api/[.]well-known/security[.]txt.tsx',
  ])('loads the split modules of %s', async (filename) => {
    const route = await loadRoute(routeSource('route'), {
      filename,
      routeId: '/route',
    })
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual([{ name: 'route' }, '<p>route</p>'])
  })

  // The documented order: the framework's JSX plugin after the router
  // plugin (the order of every route app: `@vitejs/plugin-react` /
  // `vite-plugin-solid` after `tanstackRouter`, as Vite resolves them). The
  // other order (a correct split, or an actionable diagnostic naming the
  // plugins, SPEC G11) goes through real builds:
  // integration/code-splitter-pragmas.test.ts.
  it.each([
    {
      name: '@vitejs/plugin-react',
      target: 'react' as const,
      route: routeSource('order'),
      routeId: '/order',
    },
    {
      name: 'vite-plugin-solid',
      target: 'solid' as const,
      route: `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ component: () => <p>solid</p> })
`,
      routeId: '/',
    },
  ])(
    'accepts $name after the router plugin',
    async ({ target, route, routeId }) => {
      const loaded = await loadRoute(route, {
        targetFramework: target,
        routeId,
      })
      expect(await loaded.isLazy('component')).toBe(true)
    },
  )

  // A dev server compiles each edit of a route file with the same plugin
  // instance.
  it('compiles an edited route like a fresh one after a version whose loader and component shared a binding', async () => {
    const files = { 'label.ts': `export const label = { text: 'imported' }\n` }
    const before = await loadRoute(
      `${head}const label = { text: 'before' }
export const Route = createFileRoute('/')({
  loader: () => label,
  component: () => <p>{label.text}</p>,
})
`,
      { files },
    )
    expect(await before.run(`return render('component')`)).toBe('<p>before</p>')
    const after = await loadRoute(
      `${head}import { label } from './label'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{label.text}</p>,
})
`,
      { files },
    )
    await expectValidModules(after)
    expect(
      await after.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['data', '<p>imported</p>'])
  })

  // Each framework's route module imports the lazy route helpers from its
  // own router package, and no module the page loads is another
  // framework's router: the routes run with the real router of their
  // framework in the page.
  describe.each(['solid', 'vue'] as const)('a %s route', (framework) => {
    const routerPackage = `@tanstack/${framework}-router`
    const otherRouters = ['react', 'solid', 'vue']
      .filter((other) => other !== framework)
      .map((other) => `${other}-router`)
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
        const route = await loadRoute(code, {
          targetFramework: framework,
          routeId: '/posts',
          files: { 'posts.ts': `export const fetchPosts = () => ['post']\n` },
        })
        await expectValidModules(route)
        const loaded = await route.run<{
          html: string
          others: Array<string>
        }>(`await trigger('component')
await trigger('loader')
const html = (await renderRoute()).replace(/<!--.*?-->/g, '')
const others = ${JSON.stringify(otherRouters)}
return {
  html,
  others: performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => others.some((other) => name.includes(other))),
}`)
        expect([
          loaded,
          await route.isLazy('component'),
          await route.isLazy('loader'),
        ]).toEqual([{ html: '<ul>1</ul>', others: [] }, true, loaderSplit])
      },
    )
  })
})

// A route compiled for route HMR also serves where no HMR runtime runs:
// the dev server's SSR environment through a module runner without HMR
// (Vite's public \`createServerModuleRunner(environment, { hmr: false })\`,
// as a custom SSR server or a non-Node runtime creates one: no
// \`import.meta.hot\`). SPEC J3.8: without an HMR runtime the module still
// evaluates and \`Route\` works.
it.each([
  { name: 'code splitter', options: {} },
  {
    name: 'route HMR plugin (code splitting off)',
    options: { pluginOptions: { autoCodeSplitting: false } },
  },
])(
  'a route compiled for HMR by the $name evaluates and works in the SSR environment',
  async ({ options }) => {
    const route = await loadRoute(routeSource('ssr'), {
      routeId: '/ssr',
      hmr: true,
      ...options,
    })
    const runner = createServerModuleRunner(
      route.host.dev.vite.environments.ssr,
      { hmr: false },
    )
    const { Route } = await runner.import(route.url)
    const { loader, component } = Route.options
    await component.preload?.()
    await runner.close()
    expect([
      await (typeof loader === 'function' ? loader() : loader.handler()),
      typeof component,
    ]).toEqual([{ name: 'ssr' }, 'function'])
  },
)

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
      expect(run.errors).toEqual([])
    },
    30_000,
  )
})

/**
 * The directive prologue of a module as the page receives it: the leading
 * string-literal expression statements, after the statements Vite's import
 * analysis puts first (its hot context and the CommonJS interop of
 * dependencies, which name Vite's own `__vite__` bindings: not the
 * module's code). An independent parse of the served module.
 */
function servedPrologue(code: string) {
  const { program } = parseSync('module.js', code, { sourceType: 'module' })
  const body = program.body as Array<ESTree.Statement>
  let index = 0
  while (
    index < body.length &&
    /\b__vite__\w+/.test(code.slice(body[index]!.start, body[index]!.end))
  ) {
    index++
  }
  const directives: Array<string> = []
  for (; index < body.length; index++) {
    const statement = body[index]!
    if (
      statement.type !== 'ExpressionStatement' ||
      statement.expression.type !== 'Literal' ||
      typeof statement.expression.value !== 'string'
    ) {
      break
    }
    directives.push(statement.expression.value)
  }
  return directives
}

// Shape of the deleted code-splitter snapshot fixture directive-prologue. A
// directive only applies as the first statement of a module: the route
// module and every module carrying the route file's code keep it first
// (a pure support module the compiler adds may have none, §5.8).
it('keeps the directive prologue of a route file first in the route module and every module holding its code', async () => {
  const route = await loadRoute(
    `'use client'

import { createFileRoute } from '@tanstack/react-router'

const label = 'directive preserved'

export const Route = createFileRoute('/directive')({
  loader: () => label,
  component: () => <div>{label} MARK_PAGE</div>,
  errorComponent: () => <div>error</div>,
})
`,
    { routeId: '/directive' },
  )
  expect(await route.isLazy('component')).toBe(true)
  const { modules } = await route.modules()
  const carrying = Object.entries(modules).filter(
    ([name, code]) =>
      name === 'reference' ||
      ['directive preserved', 'MARK_PAGE', 'error'].some((marker) =>
        holdsMarker(code, marker),
      ),
  )
  // The route module, the component's and the error component's code
  expect(carrying.length).toBeGreaterThan(2)
  for (const [name, code] of carrying) {
    expect(servedPrologue(code)[0], name).toBe('use client')
  }
})

// Source: #8504 router-utils prepend-statements.test.ts ("inserts after the
// complete prologue"), at compiler level: the route HMR code and the
// splitter's imports go after the whole prologue.
it.each([false, true])(
  'keeps the whole directive prologue first (hmr: %s)',
  async (hmr) => {
    const route = await loadRoute(
      `'use client'
'use strict'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/directive')({
  component: () => <div>page</div>,
})
`,
      { hmr, routeId: '/directive' },
    )
    // The order among the directives of one prologue is free (SPEC §5.5):
    // both lead the module, each once.
    expect(servedPrologue(await route.transform()).sort()).toEqual([
      'use client',
      'use strict',
    ])
  },
)

// Source: #8504 router-utils diagnostics.test.ts ("reports actionable syntax
// locations"), at plugin level. Bundlers name the file of a plugin error;
// the plugin reports where in it the error is.
it.each(['\n', '\r\n', '\r', ' ', ' '])(
  'reports the line and column of a syntax error in a route file with %j line endings and Unicode source',
  async (newline) => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({})
// 😀é${newline}/* 😀é */ export const broken = ;`
    const route = await loadRoute(code, { hmr: true })
    // The error points at the unexpected `;` (structured fields or a
    // rendered code frame; the wording and the channel are free).
    const thrown = await captureThrow(() => route.transform())
    expectDiagnostic([...thrown, ...(await route.diagnostics())], {
      severity: 'error',
      position: diagnosticPosition(code, code.lastIndexOf(';')),
      source: code,
    })
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

  // Source: corpus-diff, tinloof/tanstack-wsr src/types.ts (an empty type
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
// helper, an IIFE) is unsupported but user-fixable (user ruling 2026-10-17,
// decision D11): it is either split like a module-scope route (and
// hot-updates in place), or left unsplit with a warning naming the file, in
// production as in development. Either way it renders correctly; silent
// wrong output, or unsplit without a warning, fails.
// Sources: #8504 (code-splitter-plugin-pipeline.test.ts); the #8504
// confidence campaign (route-factory cases 1-3 and 5, dev-hmr D1/D2).
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
  // (decision D11: the user can change the pattern), across the edits of
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
          // The shared page leaves the app first, so that the edit's hot
          // update does not reload it under the next run
          await runInPage({ pageUrl: 'about:blank', script: 'return null' })
          await loaded.host.edit({
            'made.tsx': version('made', edit),
            'other.tsx': version('other', edit),
          })
        }
        // Both route files load with their split components
        const lazy = await loaded.run<
          Record<string, boolean>
        >(`let before = new Set(compiled())
await trigger('component')
const made = compiled().some((request) => !before.has(request))
const other = await app('other.tsx')
before = new Set(compiled())
await other.Route.options.component?.preload?.()
return { made, other: compiled().some((request) => !before.has(request)) }`)
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
