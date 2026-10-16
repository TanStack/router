/**
 * Route HMR: editing a route file updates the live route in place, keeping
 * the identity of its components so that the framework's refresh can patch
 * them without a remount, and nothing of it ships when HMR is off.
 *
 * Hot updates run with `hotUpdate` (a real `RouterCore` and route classes);
 * compiled modules are evaluated with `loadRoute` / `evaluateModule`.
 */
import { describe, expect, it, test, vi } from 'vitest'
import {
  compileRouteModules,
  evaluateModule,
  expectValidModules,
  head,
  hotUpdate,
  importSources,
  loadRoute,
} from './regression-helpers'
import type { TargetFramework } from './regression-helpers'

/** Imports of the route files below that are not the router package. */
const stubs = {
  './posts': { fetchPosts: () => ['post'] },
}

/** A route file whose loader returns `data`, with its other options. */
const fileRoute = (
  data: string,
  options: string,
  declarations = '',
  framework: TargetFramework = 'react',
) => `import { createFileRoute } from '@tanstack/${framework}-router'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => '${data}',
  ${options}
})`

const posts = `function PostsComponent() {
  return <div>posts</div>
}
function PostsErrorComponent() {
  return <div>Error loading posts</div>
}`

/**
 * Split routes and the component options each one splits. Each fixture is a
 * function of the loader's data, so the update can tell the new module's
 * loader apart.
 */
const splitRoutes = [
  {
    name: 'an arrow function component',
    route: (data: string) =>
      fileRoute(data, 'component: PostsComponent,', '').concat(
        '\nconst PostsComponent = () => <div>posts</div>',
      ),
    components: ['component'],
  },
  {
    name: 'a function declaration component',
    route: (data: string) =>
      fileRoute(data, 'component: PostsComponent,', posts),
    components: ['component'],
  },
  {
    name: 'two split components',
    route: (data: string) =>
      fileRoute(
        data,
        'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
        posts,
      ),
    components: ['component', 'errorComponent'],
  },
  {
    name: 'components under quoted keys',
    route: (data: string) =>
      fileRoute(
        data,
        `'component': PostsComponent,\n  'errorComponent': PostsErrorComponent,`,
        posts,
      ),
    components: ['component', 'errorComponent'],
  },
  {
    name: 'a split loader in its own chunk',
    route: (data: string) =>
      fileRoute(
        data,
        `component: PostsComponent,\n  codeSplitGroupings: [['loader'], ['component']],`,
        posts,
      ),
    components: ['component'],
  },
]

/** The value a loader of the live route returns, split or not. */
async function loaderData(update: Awaited<ReturnType<typeof hotUpdate>>) {
  return (await update.load('loader')).call(undefined)
}

describe('a hot update of a split route', () => {
  // Source: add-hmr snapshot fixtures arrow-function, function-declaration,
  // multi-component and string-literal-keys (React, Vite and webpack); the
  // split loader row replaces react-refresh-route-components "does not keep
  // a split loader in the HMR data".
  describe.each(['vite', 'webpack'] as const)('%s', (style) => {
    it.each(splitRoutes)(
      'keeps the split components and applies the new options ($name)',
      async ({ route, components }) => {
        const update = await hotUpdate(route('old'), {
          style,
          codeSplitting: true,
          refresh: true,
          updated: route('new'),
          stubs,
        })
        expect(update.invalidated).toBe(false)
        for (const option of components) {
          expect(update.isLazy(option), option).toBe(true)
          expect(update.live[option], option).toBe(update.previous[option])
        }
        expect(await loaderData(update)).toBe('new')
        expect((await update.load('component'))()).toBe('<div>posts</div>')
      },
    )
  })

  /** A Solid or Vue split route, compiled for the dev server. */
  const frameworkRoute = (framework: TargetFramework) => (data: string) =>
    fileRoute(data, 'component: PostsComponent,', posts, framework)

  // Source: add-hmr snapshot fixture solid/arrow-function.
  test.each(['solid', 'vue'] as const)(
    '%s: applies the new options with the router package of the framework',
    async (framework) => {
      const route = frameworkRoute(framework)
      const update = await hotUpdate(route('old'), {
        targetFramework: framework,
        codeSplitting: true,
        updated: route('new'),
      })
      expect(update.invalidated).toBe(false)
      expect(await loaderData(update)).toBe('new')
      expect((await update.load('component'))()).toBe('<div>posts</div>')
      // No React code: React Refresh's hooks on `window` are never installed.
      expect(Object.keys(update.window)).toEqual(['__TSR_ROUTER__'])
      const { modules } = compileRouteModules(route('old'), {
        targetFramework: framework,
        hmr: true,
      })
      for (const code of Object.values(modules)) {
        expect(importSources(code)).not.toContain('react')
        expect(importSources(code)).not.toContain('@tanstack/react-router')
      }
    },
  )

  // Bug: route HMR keeps the previous split components only for React: for
  // Solid and Vue, the route module creates a new lazy component on every
  // update and `handleRouteUpdate` keeps no component option
  // (`getFrameworkHmrCompilerPlugins` returns no plugin and the kept
  // component keys are empty for other targets).
  // Impact: every edit of a Solid or Vue route file remounts the route's
  // component, losing its state, instead of patching it in place.
  // Source: decision D10 (Solid/Vue split components keep their identity
  // across hot updates, as React's do); gaps H8/H9.
  test.fails.each(['solid', 'vue'] as const)(
    '%s: keeps the split component',
    async (framework) => {
      const route = frameworkRoute(framework)
      const update = await hotUpdate(route('old'), {
        targetFramework: framework,
        codeSplitting: true,
        updated: route('new'),
      })
      expect(update.live.component).toBe(update.previous.component)
    },
  )
})

describe('a hot update of a root route', () => {
  const root = (
    data: string,
  ) => `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  loader: () => '${data}',
  component: RootComponent,
})
function RootComponent() {
  return <div>Hello</div>
}`

  // Source: add-hmr snapshot fixture createRootRoute and the generated root
  // route id (`/__root`) test.
  it.each(['vite', 'webpack'] as const)(
    '%s: reaches the root route, keeps its component and applies the new loader',
    async (style) => {
      const update = await hotUpdate(root('old'), {
        style,
        codeSplitting: true,
        refresh: true,
        routeId: '/__root',
        updated: root('new'),
      })
      expect(update.invalidated).toBe(false)
      expect(update.isLazy('component')).toBe(false)
      expect(update.live.component).toBe(update.previous.component)
      expect(update.live.component).toBeTypeOf('function')
      expect(await loaderData(update)).toBe('new')
    },
  )
})

describe('the route a hot update applies to', () => {
  // Source: add-hmr "prefers the current generated route id over stale Vite
  // hot data". A route file moved to another path keeps its hot data, which
  // still names the route of its old path.
  it('is the route the file is registered under now, not the one in stale hot data', async () => {
    const route = (data: string) => fileRoute(data, '')
    const update = await hotUpdate(route('old'), {
      codeSplitting: true,
      initialData: { 'tsr-route-id': '/stale' },
      updated: route('new'),
    })
    expect(await loaderData(update)).toBe('new')
  })
})

describe('route modules compiled for the dev server', () => {
  const router = {
    createFileRoute: () => (options: unknown) => ({ options }),
    createRootRoute: (options: unknown) => ({ options }),
    lazyRouteComponent: () => () => null,
    lazyFn: () => () => null,
  }

  // Source: #7074 (gap H13). Bundlers do not always provide `hot.data`, or
  // `import.meta.hot` at all (a module loaded outside the HMR runtime).
  describe.each([
    {
      name: 'a split route',
      route: fileRoute(
        'data',
        'component: Page,',
        posts.replace('PostsComponent', 'Page'),
      ),
    },
    {
      name: 'an unsplittable root route',
      route: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <div>root</div> })`,
    },
  ])('$name', ({ route }) => {
    const { reference } = compileRouteModules(route, { hmr: true }).modules
    it.each([
      { name: 'a hot API without data', hot: { accept() {}, dispose() {} } },
      { name: 'no hot API', hot: undefined },
    ])('evaluates with $name', async ({ hot }) => {
      for (const window of [undefined, {}]) {
        vi.stubGlobal('window', window)
        try {
          const { Route } = await evaluateModule(
            reference!,
            { '@tanstack/react-router': router },
            { importMeta: { hot } },
          )
          expect(Route).toHaveProperty('options.component')
        } finally {
          vi.unstubAllGlobals()
        }
      }
    })
  })

  // Source: add-hmr snapshot fixture string-literal-keys.
  it('split options under quoted keys like the others', async () => {
    const route = await loadRoute(
      `${head}function Page() {
  return <p>page</p>
}
function Err() {
  return <p>error</p>
}
export const Route = createFileRoute('/')({ 'component': Page, 'errorComponent': Err })`,
      { hmr: true },
    )
    await expectValidModules(route.modules)
    expect([route.isLazy('component'), route.isLazy('errorComponent')]).toEqual(
      [true, true],
    )
    expect((await route.load('component'))()).toBe('<p>page</p>')
    expect((await route.load('errorComponent'))()).toBe('<p>error</p>')
  })

  // Source: add-hmr snapshot fixture destructuring.
  it.each([true, false])(
    'leave a module that creates no route as it is (hmr: %s)',
    (hmr) => {
      const code = `import thing from 'thing'
export function test() {
  const {
    foo: {
      bar: { destructured },
    },
  } = thing
  return destructured
}`
      expect(compileRouteModules(code, { hmr }).modules).toEqual({
        reference: code,
      })
    },
  )

  // Source: add-hmr snapshot fixture explicit-undefined-component.
  it('keep an explicitly undefined component undefined', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  component: undefined,
})`,
      { hmr: true, refresh: true },
    )
    await expectValidModules(route.modules)
    expect(route.isLazy('component')).toBe(false)
    expect('component' in route.options).toBe(true)
    expect(route.options.component).toBeUndefined()
  })
})

describe('route modules compiled without HMR', () => {
  // Source: the add-hmr `@false` snapshots (every fixture compiled with
  // `addHmr: false`).
  const routes = [
    {
      name: 'a split route',
      route: fileRoute('data', 'component: PostsComponent,', posts),
    },
    {
      name: 'a route with two split components',
      route: fileRoute(
        'data',
        'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
        posts,
      ),
    },
    {
      name: 'a route with lowercase components',
      route: `${head}export const Route = createFileRoute('/')({
  pendingComponent: pendingComponent,
  errorComponent: errorComponent,
  component: component,
})
function pendingComponent() {
  return <div>Pending</div>
}
function errorComponent() {
  return <div>Error</div>
}
function component() {
  return <div>Hello</div>
}`,
    },
    {
      name: 'a root route',
      route: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  shellComponent: ({ children }) => <html>{children}</html>,
  component: () => <div>root</div>,
})`,
    },
    {
      name: 'a root route with context',
      route: `import { createRootRouteWithContext } from '@tanstack/react-router'
interface MyRouterContext {
  auth: boolean
}
export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
})
function RootComponent() {
  return <div>Hello</div>
}`,
    },
    {
      name: 'an explicitly undefined component',
      route: `${head}export const Route = createFileRoute('/')({ component: undefined })`,
    },
    {
      name: 'a Solid route',
      route: fileRoute('data', 'component: PostsComponent,', posts, 'solid'),
      targetFramework: 'solid' as const,
    },
  ]

  it.each(routes)(
    'have no HMR code and leave window untouched ($name)',
    async ({ route, targetFramework }) => {
      const loaded = await loadRoute(route, { targetFramework })
      for (const [name, code] of Object.entries(loaded.modules)) {
        expect(code, name).not.toMatch(/import\.meta\.(?:webpackHot|hot)\b/)
      }
      const window = {}
      vi.stubGlobal('window', window)
      try {
        const again = await loadRoute(route, { targetFramework })
        for (const option of ['component', 'errorComponent']) {
          await again.load(option)
        }
      } finally {
        vi.unstubAllGlobals()
      }
      expect(window).toEqual({})
    },
  )
})
