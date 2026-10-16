/**
 * Known route HMR and React Refresh bugs. Each test asserts correct behaviour
 * for a bug on main and is marked .fails; remove .fails when the bug is fixed.
 *
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place; a component React Refresh does
 * not register keeps rendering the old code until a full reload.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as reactRouter from '@tanstack/react-router'
import {
  BaseRootRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { createServer } from 'vite'
import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '../../history/src'
import { tanstackRouter } from '../src/vite'
import { build, routeApp } from './build-harness'
import {
  compileRouteModules,
  evaluateModule,
  expectRefreshableRouteOption,
  expectValidModules,
  exportedNames,
  head,
  loadRoute,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'

/** Compiles every module the code splitter emits, with React HMR. */
function compileWithCodeSplitting(code: string) {
  return compileRouteModules(code, { hmr: true }).modules
}

describe('React Refresh registration', () => {
  // Control for the inline component pins below (same assertion).
  test('a memo of a top-level component is refreshable', async () => {
    await expectRefreshableRouteOption(
      transformWithRouteHmrPlugin(`${head}import { memo } from 'react'
function Page() {
  return <p>hi</p>
}
export const Route = createFileRoute('/')({ component: memo(Page) })`),
      'component',
    )
  })

  // Bug: inline component options that are not plain functions (`memo(...)`,
  // `forwardRef(...)`, method shorthand) are neither hoisted nor registered,
  // nor is the function they wrap.
  // Impact: on unsplit routes (root routes, or file routes without automatic
  // code splitting), edits to these components are dropped until a reload.
  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline functions"
  test.fails.each([
    {
      name: 'memo(() => ...)',
      code: `${head}import { memo } from 'react'
export const Route = createFileRoute('/')({ component: memo(() => <p>hi</p>) })`,
      compile: transformWithRouteHmrPlugin,
    },
    {
      name: 'forwardRef(function () { ... })',
      code: `${head}import { forwardRef } from 'react'
export const Route = createFileRoute('/')({
  component: forwardRef(function (props, ref) {
    return <p ref={ref}>hi</p>
  }),
})`,
      compile: transformWithRouteHmrPlugin,
    },
    {
      name: 'method shorthand',
      code: `${head}export const Route = createFileRoute('/')({
  component() {
    return <p>hi</p>
  },
})`,
      compile: transformWithRouteHmrPlugin,
    },
    {
      name: 'React.memo(forwardRef(...)) on a root route',
      code: `import React, { forwardRef } from 'react'
import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: React.memo(forwardRef(function Root(props, ref) {
    return <p ref={ref}>root</p>
  })),
})`,
      compile: (code: string) => compileWithCodeSplitting(code).reference!,
    },
  ])(
    'registers an inline component written as $name',
    async ({ code, compile }) => {
      await expectRefreshableRouteOption(compile(code), 'component')
    },
  )

  /**
   * Loads, with React HMR and React Refresh, a route whose `component` option
   * is `name`, declared by `declaration`, and returns the component the route
   * renders once its lazy option loaded, and the components React Refresh
   * registers.
   */
  async function splitComponentRegistration(declaration: string, name: string) {
    const route = await loadRoute(
      `${head}${declaration}
export const Route = createFileRoute('/')({ component: ${name} })`,
      { hmr: true, refresh: true },
    )
    await expectValidModules(route.modules)
    const binding = await route.load('component')
    expect(binding).toBeDefined()
    return { binding, registered: [...route.registered.keys()] }
  }

  // Control for the lowercase pin below (same harness).
  test('registers a PascalCase split component', async () => {
    const { binding, registered } = await splitComponentRegistration(
      `const Page = () => <p>hi</p>`,
      'Page',
    )
    expect(registered).toContain(binding)
  })

  // Bug: a lowercase component declared as a variable keeps its name in its
  // split chunk, and React Refresh registers PascalCase names only (a
  // lowercase `function` declaration is renamed, a variable is not).
  // Impact: edits to the component are not hot-updated; the cached lazy
  // component keeps rendering the old code until a reload.
  // Source: ReactFreshBabelPlugin-test "only registers pascal case functions"
  test.fails.each([
    ['an arrow function', `const page = () => <p>hi</p>`],
    [
      'a function expression',
      `const page = function page() {\n  return <p>hi</p>\n}`,
    ],
  ])(
    'registers a lowercase split component declared as %s',
    async (_, declaration) => {
      const { binding, registered } = await splitComponentRegistration(
        declaration,
        'page',
      )
      expect(registered).toContain(binding)
    },
  )
})

describe('generated code', () => {
  /** Evaluates the route module compiled with HMR and returns its route. */
  async function evaluateRoute(code: string) {
    const { Route } = await loadRoute(code, { hmr: true })
    return Route as { options: { component?: unknown } }
  }

  // Control for the options-in-a-variable pins below (same harness).
  test.each([
    {
      name: 'an unsplittable root route',
      code: `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => <Outlet />,
})`,
    },
    {
      name: 'a split file route',
      code: `${head}export const Route = createFileRoute('/')({
  component: () => <p>home</p>,
})`,
    },
  ])(
    'inline route options ($name) evaluate to a route with a component',
    async ({ code }) => {
      const Route = await evaluateRoute(code)
      expect(typeof Route.options.component).toBe('function')
    },
  )

  // Bug: when the route options are passed through a variable, the HMR
  // transforms replace `component` in the options object with a generated
  // binding declared after the object that reads it.
  // Impact: the route module throws a TDZ ReferenceError in development.
  test.fails.each([
    {
      name: 'an unsplittable root route',
      code: `import { createRootRoute, Outlet } from '@tanstack/react-router'
const options = {
  component: () => <Outlet />,
}
export const Route = createRootRoute(options)`,
    },
    {
      name: 'a split file route',
      code: `${head}const options = {
  component: () => <p>home</p>,
}
export const Route = createFileRoute('/')(options)`,
    },
  ])(
    'route options in a variable ($name) evaluate to a route with a component',
    async ({ code }) => {
      const Route = await evaluateRoute(code)
      expect(typeof Route.options.component).toBe('function')
    },
  )

  // Bug: our `react-refresh-ignored-route-exports` compiler plugin injects a
  // top-level `const hot = import.meta.hot` that collides with a user's
  // top-level `hot` binding (compile error `Duplicate declaration "hot"`).
  // Impact: the route cannot be served in development.
  test.fails(
    'a user binding named hot does not collide with the injected HMR code',
    async () => {
      const modules = compileWithCodeSplitting(`${head}export const hot = 'hot'
export const Route = createFileRoute('/')({
  component: () => <p>{hot}</p>,
})`)
      await expectValidModules(modules)
      expect(exportedNames(modules.reference!)).toContain('hot')
    },
  )

  /**
   * Loads, with HMR, a route whose `page` component (declared by
   * `declaration`) the loader also reads, so the code splitter shares it with
   * the loader. Loads the split component and renders it twice. `page` counts
   * its renders in a module-level `let` initialized by `init` from `./state`.
   * Returns both renders and how many times `init` ran.
   */
  async function renderSharedComponentTwice(declaration: string) {
    let inits = 0
    const route = await loadRoute(
      `${head}import { init } from './state'
let renders = init(0)
${declaration}
export const Route = createFileRoute('/')({
  loader: () => page.name,
  component: page,
})`,
      {
        hmr: true,
        stubs: {
          './state': {
            init: (value: number) => {
              inits++
              return value
            },
          },
        },
      },
    )
    const component = await route.load('component')
    return [component(), component(), inits]
  }

  // Control for the lowercase shared component pin below (same harness).
  test('a lowercase arrow component shared with the loader renders with the module state it shares', async () => {
    expect(
      await renderSharedComponentTwice(`const page = () => {
  renders++
  return <p>{renders}</p>
}`),
    ).toEqual(['<p>1</p>', '<p>2</p>', 1])
  })

  // Bug: React HMR renames a lowercase `function` component in its split
  // chunk even when the code splitter moved the component to the shared
  // module, so the chunk exports `SplitComponent`, which nothing declares.
  // Impact: in development, the route's component chunk fails to load
  // (SyntaxError: Export 'SplitComponent' is not defined).
  test.fails(
    'a lowercase function component shared with the loader renders with the module state it shares',
    async () => {
      expect(
        await renderSharedComponentTwice(`function page() {
  renders++
  return <p>{renders}</p>
}`),
      ).toEqual(['<p>1</p>', '<p>2</p>', 1])
    },
  )

  /**
   * Compiles a route with the route HMR plugin (automatic code splitting
   * off), evaluates it and returns its route.
   */
  async function evaluateUnsplitRoute(code: string) {
    const { Route } = await evaluateModule(transformWithRouteHmrPlugin(code), {
      '@tanstack/react-router': {
        createFileRoute: () => (options: unknown) => ({ options }),
      },
    })
    return Route as unknown as { options: Record<string, () => unknown> }
  }

  // Control for the hoisted inline component pin below (same harness).
  test('an inline component reading a lowercase component renders it', async () => {
    const Route =
      await evaluateUnsplitRoute(`${head}const missing = () => <p>missing</p>
export const Route = createFileRoute('/')({
  pendingComponent: () => missing(),
})`)
    expect(Route.options.pendingComponent!()).toBe('<p>missing</p>')
  })

  // Bug: React HMR hoists inline component options into declarations it
  // inserts after visiting every option, and renames a lowercase component
  // passed to a later option. The rename only reaches nodes attached to the
  // program, so a hoisted component still reads the old name.
  // Impact: in development, the hoisted component throws when it renders
  // (ReferenceError: missing is not defined).
  // Fix: rename before hoisting (or insert hoisted declarations immediately),
  // or rename through the analyzer's binding references.
  test.fails(
    'an inline component hoisted before a renamed lowercase component renders it',
    async () => {
      const Route =
        await evaluateUnsplitRoute(`${head}const missing = () => <p>missing</p>
export const Route = createFileRoute('/')({
  pendingComponent: () => missing(),
  notFoundComponent: missing,
})`)
      expect(Route.options.pendingComponent!()).toBe('<p>missing</p>')
      expect(Route.options.notFoundComponent!()).toBe('<p>missing</p>')
    },
  )
})

describe('route updates', () => {
  const getStoreConfig: GetStoreConfig = () => ({
    createMutableStore: createNonReactiveMutableStore,
    createReadonlyStore: createNonReactiveReadonlyStore,
    batch: (fn) => fn(),
  })

  /**
   * Compiles a route file at `/` with the route HMR plugin for `style`, then
   * runs a hot update the way the bundler does: loads the module with the
   * bundler's hot API on `import.meta`, adds its `Route` to a route tree as
   * the generated route tree does and creates a router with it
   * (`window.__TSR_ROUTER__`), and loads the module again with the same hot
   * data (Vite: the first module's accept callback receives the new module;
   * webpack: the module re-runs with the data its dispose handlers wrote).
   * Returns whether the update reaches the page: the live route now has the
   * new module's `option`, or the module asked the bundler for a full reload
   * (`hot.invalidate()`).
   */
  async function hotUpdate(
    code: string,
    style: 'vite' | 'webpack',
    option = 'loader',
  ) {
    const compiled = transformWithRouteHmrPlugin(code, {
      target: 'react',
      plugin: { hmr: { style } },
    })
    const created: Array<Record<string, unknown>> = []
    let data: Record<string, unknown> = {}
    let invalidated = false
    let accepted: Array<(module: unknown) => void> = []
    const disposers: Array<(data: Record<string, unknown>) => void> = []
    const load = () =>
      evaluateModule(
        compiled,
        {
          '@tanstack/react-router': {
            ...reactRouter,
            createFileRoute:
              (path: string) => (options: Record<string, unknown>) => {
                // A copy: the HMR code writes kept options into the new ones.
                created.push({ ...options })
                return (reactRouter.createFileRoute as any)(path)(options)
              },
          },
        },
        {
          importMeta: {
            [style === 'webpack' ? 'webpackHot' : 'hot']: {
              data,
              accept: (callback?: (module: unknown) => void) => {
                if (callback) {
                  accepted.push(callback)
                }
              },
              dispose: (callback: (data: Record<string, unknown>) => void) => {
                disposers.push(callback)
              },
              invalidate: () => {
                invalidated = true
              },
            },
          },
        },
      )
    const window: { __TSR_ROUTER__?: RouterCore<any, any, any, any, any> } = {}
    vi.stubGlobal('window', window)
    try {
      const first = await load()
      const rootRoute = new BaseRootRoute({})
      const route = (first.Route as unknown as AnyRoute).update({
        id: '/',
        path: '/',
        getParentRoute: () => rootRoute,
      } as never)
      const router = new RouterCore(
        {
          routeTree: rootRoute.addChildren([route]),
          history: createMemoryHistory({ initialEntries: ['/'] }),
          isServer: true,
        },
        getStoreConfig,
      )
      window.__TSR_ROUTER__ = router
      if (style === 'webpack') {
        const next: Record<string, unknown> = {}
        disposers.forEach((dispose) => dispose(next))
        data = next
      }
      const firstAccepted = accepted
      accepted = []
      const second = await load()
      firstAccepted.forEach((accept) => accept(second))
      const { options } = router.routesById['/'] as unknown as {
        options: Record<string, unknown>
      }
      return invalidated || options[option] === created[1]![option]
    } finally {
      vi.unstubAllGlobals()
    }
  }

  // Control for the route update pins below (same harness).
  test.each(['vite', 'webpack'] as const)(
    '%s: a hot update gives the live route the new options',
    async (style) => {
      expect(
        await hotUpdate(
          `${head}export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>page</p>,
})`,
          style,
        ),
      ).toBe(true)
    },
  )

  // Bug: the injected HMR code reads the module's route through the
  // identifier `Route`, but a route may be declared under another name and
  // exported as `Route` (`export { MyRoute as Route }`).
  // Impact: webpack and Rspack apps throw "Route is not defined" when the
  // route module loads in development; Vite apps throw on the first hot
  // update of the route.
  test.fails.each(['vite', 'webpack'] as const)(
    '%s: a route exported under another local name is hot-updated',
    async (style) => {
      expect(
        await hotUpdate(
          `${head}const MyRoute = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>page</p>,
})
export { MyRoute as Route }`,
          style,
        ),
      ).toBe(true)
    },
  )

  // Bug: `handleRouteUpdate` keeps the previous component by assigning it to
  // the new route options, which throws when the option is a getter.
  // Impact: every hot update of a route with a getter component option fails
  // ("Cannot set property component of #<Object> which has only a getter").
  test.fails.each(['vite', 'webpack'] as const)(
    '%s: a route with a getter component option is hot-updated',
    async (style) => {
      expect(
        await hotUpdate(
          `${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  get component() {
    return Page
  },
})`,
          style,
        ),
      ).toBe(true)
    },
  )

  // Bug: `handleRouteUpdate` keeps the previous component options for React
  // Refresh to patch in place, also when no React Refresh runtime is installed
  // (webpack or Rspack without a refresh plugin, like the webpack quickstart
  // example with the default `addHmr`), so the new component never renders.
  // With automatic code splitting, the kept component is the old chunk's.
  // Impact: webpack reports the route (and its split chunk) as hot-updated,
  // but the page shows the old component until a reload; without the route
  // HMR code the same edit reloads the page.
  test.fails(
    'webpack: without React Refresh, a hot update renders the new component',
    async () => {
      expect(
        await hotUpdate(
          `${head}export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>page</p>,
})`,
          'webpack',
          'component',
        ),
      ).toBe(true)
    },
  )
})

describe('Vite HMR boundaries', () => {
  // Bug: the Vite route HMR code calls `accept` on a local alias
  // (`const hot = import.meta.hot`), and Vite only marks a module
  // self-accepting when its code contains a literal `import.meta.hot.accept(`.
  // A route module is then never an HMR boundary of its own: the update
  // propagates to the route tree and the app entry, and the page reloads.
  // React apps are not affected because React Refresh makes route modules
  // boundaries; Solid Refresh only does for modules that declare components,
  // and Vue JSX only for exported components.
  // Impact: every edit of a Solid route file with automatic code splitting,
  // and of any Vue route file, reloads the page in Vite dev.
  test.fails.each([
    { target: 'solid', autoCodeSplitting: true },
    { target: 'solid', autoCodeSplitting: false },
    { target: 'vue', autoCodeSplitting: true },
    { target: 'vue', autoCodeSplitting: false },
  ] as const)(
    'a $target route module accepts its own updates (autoCodeSplitting: $autoCodeSplitting)',
    async ({ target, autoCodeSplitting }) => {
      // Keep the temporary app inside the package so runtime imports resolve.
      const root = await mkdtemp(path.join(__dirname, '.hmr-boundary-'))
      const routerPackage = `@tanstack/${target}-router`
      let server: Awaited<ReturnType<typeof createServer>> | undefined
      try {
        await mkdir(path.join(root, 'routes'))
        await writeFile(
          path.join(root, 'routes/__root.tsx'),
          `import { createRootRoute } from '${routerPackage}'
export const Route = createRootRoute({})`,
        )
        await writeFile(
          path.join(root, 'routes/index.tsx'),
          `import { createFileRoute } from '${routerPackage}'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
function Page() {
  return 'page'
}`,
        )
        server = await createServer({
          root,
          configFile: false,
          logLevel: 'silent',
          server: { watch: null },
          plugins: [
            {
              // The framework packages are not dependencies of this package.
              name: 'stub-router-package',
              enforce: 'pre',
              resolveId: (id) => (id === routerPackage ? `\0${id}` : null),
              load: (id) =>
                id === `\0${routerPackage}`
                  ? 'export const createRootRoute = (o) => o, createFileRoute = () => (o) => o, lazyRouteComponent = () => null'
                  : null,
            },
            tanstackRouter({
              target,
              routesDirectory: './routes',
              generatedRouteTree: './routeTree.gen.ts',
              autoCodeSplitting,
            }),
          ],
        })
        const client = server.environments.client
        await client.transformRequest('/routes/index.tsx')
        const module =
          await client.moduleGraph.getModuleByUrl('/routes/index.tsx')
        expect(module?.isSelfAccepting).toBe(true)
      } finally {
        await server?.close()
        await rm(root, { recursive: true, force: true })
      }
    },
    30_000,
  )
})

describe('production builds', () => {
  /**
   * Builds a production client bundle with automatic code splitting off
   * (the route HMR plugin's case), with `NODE_ENV` as given (`null`: unset),
   * and returns where webpack's HMR API is used.
   */
  async function hmrPlacement(bundler: 'rspack' | 'webpack', nodeEnv?: null) {
    const app = await build({
      bundler,
      env: 'client',
      nodeEnv,
      pluginOptions: { autoCodeSplitting: false },
      files: routeApp(
        `${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
        { env: 'client' },
      ),
    })
    return app.where(/\bwebpackHot\b|\bmodule\.hot\b/)
  }

  // Control for the pin below: with `NODE_ENV=production` exported.
  test.each(['rspack', 'webpack'] as const)(
    'a production client bundle has no route HMR code (%s)',
    async (bundler) => {
      expect(await hmrPlacement(bundler)).toBe('nowhere')
    },
    60_000,
  )

  // Bug: with automatic code splitting off, the composed router plugin adds
  // the route HMR plugin unless `NODE_ENV` is `production` when the plugin is
  // created (`router-composed-plugin.ts`), instead of following the
  // bundler's mode. webpack and Rspack set `NODE_ENV` only inside the bundle.
  // Source: gap CC-P1 / routes.md R7.
  // Impact: webpack/Rspack production bundles built from a shell without
  // `NODE_ENV` ship the route HMR code of every route.
  test.fails.each(['rspack', 'webpack'] as const)(
    'a production client bundle has no route HMR code when NODE_ENV is unset (%s)',
    async (bundler) => {
      expect(await hmrPlacement(bundler, null)).toBe('nowhere')
    },
    60_000,
  )
})
