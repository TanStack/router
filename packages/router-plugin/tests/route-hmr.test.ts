/**
 * Route HMR: editing a route file updates the live route in place, keeping
 * the identity of its components so that the framework's refresh patches
 * them without a remount, and nothing of it ships when HMR is off.
 *
 * Hot updates run with `hotUpdate` (a real `RouterCore` and route classes,
 * the bundler's hot API and React Refresh's runtime): `render(option)` is
 * what the page shows after the update. Compiled modules are evaluated with
 * `loadRoute` / `evaluateModule`; what the route HMR plugin serves, and
 * which edits a Vite dev server hot-updates, is read from a real dev server
 * with the framework's Vite plugin (`editRouteFile`).
 */
import { SourceMap } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import vueJsx from '@vitejs/plugin-vue-jsx'
import solid from 'vite-plugin-solid'
import { describe, expect, it, onTestFinished, test, vi } from 'vitest'
import {
  createDevServer,
  evaluateServed,
} from '@tanstack/compiler-test-utils/dev-server'
import { rootRouteOf, routerDevServer, routerPackageStub } from './dev-server'
import {
  compileRouteModules,
  evaluateModule,
  expectValidModules,
  generatedRouteId,
  head,
  hotUpdate,
  importSources,
  loadRoute,
} from './regression-helpers'
import { editRouteFile } from './vite-hot-update'
import type { TargetFramework } from './regression-helpers'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

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

/** Components whose text names the version of the route file. */
const posts = (version: string) => `function PostsComponent() {
  return <div>posts ${version}</div>
}
function PostsErrorComponent() {
  return <div>Error loading posts ${version}</div>
}`

/**
 * Split routes and the component options each one splits. Each fixture is a
 * function of the version: its loader returns it and its components render
 * it, so the update can tell the new code apart.
 */
const splitRoutes = [
  {
    name: 'an arrow function component',
    route: (version: string) =>
      fileRoute(version, 'component: PostsComponent,', '').concat(
        `\nconst PostsComponent = () => <div>posts ${version}</div>`,
      ),
    components: ['component'],
  },
  {
    name: 'a function declaration component',
    route: (version: string) =>
      fileRoute(version, 'component: PostsComponent,', posts(version)),
    components: ['component'],
  },
  {
    name: 'two split components',
    route: (version: string) =>
      fileRoute(
        version,
        'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
        posts(version),
      ),
    components: ['component', 'errorComponent'],
  },
  {
    name: 'components under quoted keys',
    route: (version: string) =>
      fileRoute(
        version,
        `'component': PostsComponent,\n  'errorComponent': PostsErrorComponent,`,
        posts(version),
      ),
    components: ['component', 'errorComponent'],
  },
  {
    name: 'a split loader in its own chunk',
    route: (version: string) =>
      fileRoute(
        version,
        `component: PostsComponent,\n  codeSplitGroupings: [['loader'], ['component']],`,
        posts(version),
      ),
    components: ['component'],
  },
  {
    name: 'a split loader in the component chunk',
    route: (version: string) =>
      fileRoute(
        version,
        `component: PostsComponent,\n  codeSplitGroupings: [['component', 'loader']],`,
        posts(version),
      ),
    components: ['component'],
  },
]

/** What each component option of `splitRoutes` renders in a version. */
const rendered = (option: string, version: string) =>
  option === 'component'
    ? `<div>posts ${version}</div>`
    : `<div>Error loading posts ${version}</div>`

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
      'keeps the split components, renders their new code in place and applies the new options ($name)',
      async ({ route, components }) => {
        const update = await hotUpdate(route('old'), {
          style,
          codeSplitting: true,
          updated: route('new'),
        })
        expect(update.invalidated).toBe(false)
        for (const option of components) {
          expect(update.isLazy(option), option).toBe(true)
          expect(update.live[option], option).toBe(update.previous[option])
          expect(await update.render(option), option).toBe(
            rendered(option, 'new'),
          )
          expect(update.remounted(option), option).toBe(false)
        }
        expect(await loaderData(update)).toBe('new')
      },
    )
  })

  // An edit that adds or removes a split component option.
  it.each(['vite', 'webpack'] as const)(
    '%s: renders a split component option the update adds, and drops one it removes',
    async (style) => {
      const one = (version: string) =>
        fileRoute(version, 'component: PostsComponent,', posts(version))
      const two = (version: string) =>
        fileRoute(
          version,
          'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
          posts(version),
        )
      const added = await hotUpdate(one('old'), {
        style,
        codeSplitting: true,
        updated: two('new'),
      })
      expect(added.invalidated).toBe(false)
      expect(added.isLazy('errorComponent')).toBe(true)
      expect(await added.render('errorComponent')).toBe(
        rendered('errorComponent', 'new'),
      )
      expect(await added.render('component')).toBe(rendered('component', 'new'))
      const removed = await hotUpdate(two('old'), {
        style,
        codeSplitting: true,
        updated: one('new'),
      })
      expect(removed.invalidated).toBe(false)
      expect(removed.live.errorComponent).toBeUndefined()
      expect(await removed.render('component')).toBe(
        rendered('component', 'new'),
      )
    },
  )

  // A split component that reads the route, next to a loader that calls an
  // import. Source: add-hmr snapshot fixtures (main) whose component reads
  // `Route.*`.
  describe.each([
    { style: 'vite', codeSplitting: true },
    { style: 'webpack', codeSplitting: true },
    { style: 'vite', codeSplitting: false },
    { style: 'webpack', codeSplitting: false },
  ] as const)('$style (codeSplitting: $codeSplitting)', (options) => {
    it('updates a route whose component reads the route and whose loader calls an import', async () => {
      const route = (
        version: string,
      ) => `import { createFileRoute } from '@tanstack/react-router'
import { fetchData } from './api'
function Page() {
  return <div>{Route.fullPath} ${version}</div>
}
export const Route = createFileRoute('/posts')({
  loader: () => fetchData('${version}'),
  component: Page,
})`
      const update = await hotUpdate(route('old'), {
        ...options,
        routeId: '/posts',
        updated: route('new'),
        stubs: { './api': { fetchData: (data: string) => data } },
      })
      expect(update.invalidated).toBe(false)
      expect(update.live.component).toBe(update.previous.component)
      expect(await loaderData(update)).toBe('new')
      expect(await update.render('component')).toBe('<div>/posts new</div>')
      expect(update.remounted('component')).toBe(false)
    })
  })

  /** A Solid or Vue split route, compiled for the dev server. */
  const frameworkRoute = (framework: TargetFramework) => (version: string) =>
    fileRoute(
      version,
      'component: PostsComponent,',
      `function PostsComponent() {
  return <div>posts ${version}</div>
}`,
      framework,
    )

  // Solid and Vue: webpack / Rspack (whether Vite hot-updates them depends
  // on their framework plugin: the pins below and known-bugs-route-hmr.test.ts
  // "Vite HMR boundaries"). Source: add-hmr snapshot fixture
  // solid/arrow-function.
  test.each(['solid', 'vue'] as const)(
    '%s: applies the new options and renders the new component with the router package of the framework',
    async (framework) => {
      const route = frameworkRoute(framework)
      const update = await hotUpdate(route('old'), {
        style: 'webpack',
        targetFramework: framework,
        codeSplitting: true,
        updated: route('new'),
      })
      expect(update.invalidated).toBe(false)
      expect(await loaderData(update)).toBe('new')
      expect(await update.render('component')).toBe('<div>posts new</div>')
      // No React code.
      expect(Object.keys(update.window)).toEqual(['__TSR_ROUTER__'])
      for (const style of ['vite', 'webpack'] as const) {
        const { modules } = compileRouteModules(route('old'), {
          targetFramework: framework,
          hmr: true,
          pluginOptions: { plugin: { hmr: { style } } },
        })
        for (const code of Object.values(modules)) {
          expect(importSources(code)).not.toContain('react')
          expect(importSources(code)).not.toContain('@tanstack/react-router')
        }
      }
    },
  )

  // Bug: route HMR keeps the previous split components only for React: for
  // Solid and Vue, the route module creates a new lazy component on every
  // update and `handleRouteUpdate` keeps no component option
  // (`getFrameworkHmrCompilerPlugins` returns no plugin and the kept
  // component keys are empty for other targets); in Vite, the route module
  // is not an HMR boundary either (its accept call is on an alias), so the
  // page reloads.
  // Impact: every edit of a Solid or Vue route file reloads the page (Vite)
  // or remounts the route's component (webpack / Rspack), losing its state,
  // instead of patching it in place.
  // Goal (any fix): in a Vite dev server with the framework's plugin, the
  // edit is a hot update that runs the edited component's module again
  // (where the framework's refresh patches the component), and the live
  // route keeps the component the page rendered.
  // Source: decision D10 (Solid/Vue split components keep their identity
  // across hot updates, as React's do); gaps H8/H9.
  test.fails.each([
    { framework: 'solid', plugin: () => solid() },
    { framework: 'vue', plugin: () => vueJsx() },
  ] as const)(
    '$framework: keeps the split component and updates it in place',
    async ({ framework, plugin }) => {
      const route = frameworkRoute(framework)
      const served = await editRouteFile({
        target: framework,
        autoCodeSplitting: true,
        plugins: [plugin()],
        route,
        loaded: ['?tsr-split=component'],
      })
      expect(served.messages).not.toContainEqual(
        expect.stringMatching(/full-reload/),
      )
      expect(served.reimports('/routes/index.tsx?tsr-split=component')).toBe(
        true,
      )
      const update = await hotUpdate(route('old'), {
        style: 'webpack',
        targetFramework: framework,
        codeSplitting: true,
        updated: route('new'),
      })
      expect(update.live.component).toBe(update.previous.component)
    },
    30_000,
  )
})

// What a Vite dev server running `@vitejs/plugin-react` sends the page when a
// split route file is edited: a hot update, whose boundaries include the
// split component the page loaded (React Refresh patches it in place, as
// `hotUpdate` shows above).
describe('an edit of a React split route in a Vite dev server', () => {
  it('is a hot update that imports the edited split component again', async () => {
    const served = await editRouteFile({
      target: 'react',
      autoCodeSplitting: true,
      plugins: [react()],
      route: (version) =>
        fileRoute(version, 'component: PostsComponent,', posts(version)),
      loaded: ['?tsr-split=component'],
    })
    expect(served.hotUpdate).toBe(true)
    expect(served.reimports('/routes/index.tsx?tsr-split=component')).toBe(true)
  }, 30_000)

  it('is a hot update when the edit changes a value the loader and the split component share', async () => {
    const served = await editRouteFile({
      target: 'react',
      autoCodeSplitting: true,
      plugins: [react()],
      route: (version) => `${head}const label = '${version}'
function PostsComponent() {
  return <div>{label}</div>
}
export const Route = createFileRoute('/')({
  loader: () => label,
  component: PostsComponent,
})`,
      loaded: ['?tsr-split=component'],
    })
    expect(served.hotUpdate).toBe(true)
  }, 30_000)
})

describe('a hot update of a root route', () => {
  const root = (
    version: string,
  ) => `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  loader: () => '${version}',
  component: RootComponent,
})
function RootComponent() {
  return <div>Hello ${version}</div>
}`

  // Source: add-hmr snapshot fixture createRootRoute and the generated root
  // route id (`/__root`) test.
  it.each(['vite', 'webpack'] as const)(
    '%s: reaches the root route, renders its new component in place and applies the new loader',
    async (style) => {
      const update = await hotUpdate(root('old'), {
        style,
        codeSplitting: true,
        routeId: await generatedRouteId('__root.tsx'),
        updated: root('new'),
      })
      expect(update.invalidated).toBe(false)
      expect(update.live.component).toBe(update.previous.component)
      expect(await update.render('component')).toBe('<div>Hello new</div>')
      expect(update.remounted('component')).toBe(false)
      expect(await loaderData(update)).toBe('new')
    },
  )

  // `shellComponent` is a root route option. A shell changes the tree the
  // route renders in: adding or removing it renders the new components
  // (React may remount them); editing it patches them in place.
  // Source: decision on rp:1304 (shellComponent + HMR, 2026-10-18).
  const shellRoot = (options: Record<string, string>) =>
    `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
${Object.entries(options)
  .map(([option, value]) => `  ${option}: ${value},`)
  .join('\n')}
})`
  const shell = (version: string) =>
    `({ children }) => <html><body>${version}{children}</body></html>`
  const page = (version: string) => `() => <p>${version}</p>`
  describe.each(['vite', 'webpack'] as const)('%s', (style) => {
    it.each<{
      edit: string
      before: Record<string, string>
      after: Record<string, string>
    }>([
      {
        edit: 'adds',
        before: { component: page('old') },
        after: { shellComponent: shell('new'), component: page('new') },
      },
      {
        edit: 'edits',
        before: { shellComponent: shell('old'), component: page('old') },
        after: { shellComponent: shell('new'), component: page('new') },
      },
      {
        edit: 'removes',
        before: { shellComponent: shell('old'), component: page('old') },
        after: { component: page('new') },
      },
    ])(
      'an update that $edit the shell component renders the new shell and component',
      async ({ edit, before, after }) => {
        const update = await hotUpdate(shellRoot(before), {
          style,
          codeSplitting: true,
          routeId: await generatedRouteId('__root.tsx'),
          updated: shellRoot(after),
        })
        expect(update.invalidated).toBe(false)
        expect(await update.render('component')).toBe('<p>new</p>')
        if ('shellComponent' in after) {
          expect(
            await update.render('shellComponent', { children: 'page' }),
          ).toBe('<html><body>newpage</body></html>')
        } else {
          expect(update.live.shellComponent).toBeUndefined()
        }
        if (edit === 'edits') {
          expect(update.remounted('component')).toBe(false)
          expect(update.remounted('shellComponent')).toBe(false)
        }
      },
    )
  })
})

describe('a hot update of an unsplit route', () => {
  const componentOptions = [
    'component',
    'pendingComponent',
    'errorComponent',
    'notFoundComponent',
  ]
  /**
   * A route at `/` with a component for each of `options` rendering its
   * option and `version`.
   */
  const route = (data: string, options: Array<string>, version = data) =>
    fileRoute(
      data,
      options
        .map((option) => `${option}: () => <p>${option} ${version}</p>,`)
        .join('\n  '),
    )

  it.each(['vite', 'webpack'] as const)(
    '%s: keeps every component option, renders their new code in place and applies the new loader',
    async (style) => {
      const update = await hotUpdate(route('old', componentOptions), {
        style,
        updated: route('new', componentOptions),
      })
      expect(update.invalidated).toBe(false)
      for (const option of componentOptions) {
        expect(update.live[option], option).toBeTypeOf('function')
        expect(update.live[option], option).toBe(update.previous[option])
        expect(await update.render(option), option).toBe(`<p>${option} new</p>`)
        expect(update.remounted(option), option).toBe(false)
      }
      expect(await loaderData(update)).toBe('new')
    },
  )

  it.each(['vite', 'webpack'] as const)(
    '%s: drops a component option the update removes',
    async (style) => {
      const update = await hotUpdate(
        route('old', ['component', 'errorComponent']),
        { style, updated: route('new', ['component']) },
      )
      expect(update.live.errorComponent).toBeUndefined()
      expect(update.live.component).toBe(update.previous.component)
      expect(await update.render('component')).toBe('<p>component new</p>')
    },
  )

  it.each(['vite', 'webpack'] as const)(
    '%s: renders a component option the update adds',
    async (style) => {
      const update = await hotUpdate(route('old', ['component']), {
        style,
        updated: route('new', ['component', 'errorComponent'], 'added'),
      })
      expect(await update.render('errorComponent')).toBe(
        '<p>errorComponent added</p>',
      )
    },
  )

  // Solid and Vue have no React Refresh to patch a kept component in place,
  // so the update renders the new one (webpack / Rspack; see the split
  // route's Solid and Vue rows for Vite).
  test.each(['solid', 'vue'] as const)(
    '%s: renders the new component',
    async (framework) => {
      const source = (text: string) =>
        fileRoute(text, `component: () => <p>${text}</p>,`, '', framework)
      const update = await hotUpdate(source('old'), {
        style: 'webpack',
        targetFramework: framework,
        updated: source('new'),
      })
      expect(update.invalidated).toBe(false)
      expect(await update.render('component')).toBe('<p>new</p>')
      expect(await loaderData(update)).toBe('new')
      expect(Object.keys(update.window)).toEqual(['__TSR_ROUTER__'])
    },
  )

  /** A route whose options a factory call builds. */
  const factoryRoute = (
    data: string,
  ) => `import { createFileRoute } from '@tanstack/react-router'
import { makeOptions } from './options'
export const Route = createFileRoute('/')(makeOptions('${data}'))`
  const options = {
    './options': {
      makeOptions: (data: string) => ({ loader: () => data }),
    },
  }

  it('webpack: applies route options a factory call builds', async () => {
    const update = await hotUpdate(factoryRoute('old'), {
      style: 'webpack',
      updated: factoryRoute('new'),
      stubs: options,
    })
    expect(update.invalidated).toBe(false)
    expect(await loaderData(update)).toBe('new')
  })

  // Bug: a route module in which React Refresh registers no component (its
  // options come from a factory call, so there is no component to hoist and
  // the route HMR plugin adds no Fast Refresh anchor) is not a Vite HMR
  // boundary with `@vitejs/plugin-react`: the route HMR code calls `accept`
  // on an alias (`const hot = import.meta.hot`), and Vite only takes a
  // literal `import.meta.hot.accept(` (same root cause as the `.ts` route
  // module pin of known-bugs-route-hmr.test.ts "Vite HMR boundaries").
  // Impact: every edit of such a route file reloads the page in Vite dev.
  // NEW (wave 2): hotUpdate now decides Vite boundaries like Vite
  // (regression-helpers.test.ts "reloads the page exactly when a Vite dev
  // server does").
  it.fails('vite: applies route options a factory call builds', async () => {
    const update = await hotUpdate(factoryRoute('old'), {
      updated: factoryRoute('new'),
      stubs: options,
    })
    expect(update.invalidated).toBe(false)
    expect(await loaderData(update)).toBe('new')
  })
})

describe('the route a hot update applies to', () => {
  // Source: add-hmr "prefers the current generated route id over stale Vite
  // hot data". The route file was registered under another route id when
  // its previous version loaded (e.g. before a route configuration change);
  // the hot data its HMR code wrote still names that route.
  // Vite only: the webpack HMR code deliberately reads the previous route id
  // from hot data (webpack-adapter.ts).
  it('vite: is the route the file is registered under now, not the one it was registered under before', async () => {
    const route = (data: string) => fileRoute(data, '')
    const update = await hotUpdate(route('old'), {
      codeSplitting: true,
      previousRouteId: '/stale',
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
        posts('data').replace('PostsComponent', 'Page'),
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
      route: fileRoute('data', 'component: PostsComponent,', posts('data')),
    },
    {
      name: 'a route with two split components',
      route: fileRoute(
        'data',
        'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
        posts('data'),
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
      route: fileRoute(
        'data',
        'component: PostsComponent,',
        posts('data'),
        'solid',
      ),
      targetFramework: 'solid' as const,
    },
  ]

  // A production build (`addHmr` unset), and a dev server with `addHmr:
  // false`.
  describe.each([
    {
      mode: 'production',
      options: {
        command: 'build',
        pluginOptions: { codeSplittingOptions: { addHmr: undefined } },
      },
    },
    {
      mode: 'development with addHmr disabled',
      options: { command: 'serve', hmr: false },
    },
  ] as const)('in $mode', ({ options }) => {
    it.each(routes)(
      'have no HMR code ($name)',
      async ({ route, targetFramework }) => {
        const loaded = await loadRoute(route, { targetFramework, ...options })
        for (const [name, code] of Object.entries(loaded.modules)) {
          expect(code, name).not.toMatch(/import\.meta\.(?:webpackHot|hot)\b/)
        }
      },
    )
  })
})

// The route HMR plugin that `tanstackRouter` adds in development when
// automatic code splitting is off, in a Vite dev server.
describe('route HMR in a Vite dev server without automatic code splitting', () => {
  const timeout = 30_000
  // Vite's SSR transform serves `import.meta` as `__vite_ssr_import_meta__`
  const hasRouteHmr = (code: string) =>
    /(?:import\.meta|__vite_ssr_import_meta__)\.hot\b/.test(code)
  const loaderRoute = (target: TargetFramework = 'react') =>
    `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({ loader: () => 'x' })`

  // The route HMR plugin's debug output is opt-in (`TSR_VITE_DEBUG`). The
  // other debug output tests live in
  // `outside-compiler-corpus/route-hmr-debug-output.test.ts`.
  // Source: r5-gaps N9 (rp:1420, 1442, 1455, 1936: debug output on by
  // default).
  test(
    'with default options, serving a route prints nothing to the console',
    async () => {
      expect(process.env.TSR_VITE_DEBUG).toBeUndefined()
      const printed: Array<string> = []
      for (const method of ['log', 'info', 'debug'] as const) {
        vi.spyOn(console, method).mockImplementation((...args) => {
          printed.push(args.map(String).join(' '))
        })
      }
      const server = await routerDevServer({
        pluginOptions: { autoCodeSplitting: false },
        plugins: [routerPackageStub('react')],
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ loader: () => 'x', component: () => <p>x</p> })`,
        },
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
      ).toBe(true)
      vi.restoreAllMocks()
      expect(printed).toEqual([])
    },
    timeout,
  )

  test(
    'reaches route files without JSX (.ts)',
    async () => {
      const server = await routerDevServer({
        pluginOptions: { autoCodeSplitting: false },
        plugins: [routerPackageStub('react')],
        files: { 'routes/index.ts': loaderRoute() },
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.ts', 'client')),
      ).toBe(true)
    },
    timeout,
  )

  test(
    'is limited to the environment plugin.vite.environmentName names',
    async () => {
      const server = await routerDevServer({
        pluginOptions: {
          autoCodeSplitting: false,
          plugin: { vite: { environmentName: 'client' } },
        },
        plugins: [routerPackageStub('react')],
        files: { 'routes/index.tsx': loaderRoute() },
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
      ).toBe(true)
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'ssr')),
      ).toBe(false)
    },
    timeout,
  )

  test(
    'works with plugin.hmr.style alone',
    async () => {
      const server = await routerDevServer({
        pluginOptions: {
          autoCodeSplitting: false,
          plugin: { hmr: { style: 'vite' } },
        },
        plugins: [routerPackageStub('react')],
        files: { 'routes/index.tsx': loaderRoute() },
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
      ).toBe(true)
    },
    timeout,
  )

  // Solid and Vue route modules only get the route HMR code; React ones also
  // get React Refresh's, which installs its hooks on `window` when the
  // module runs in the page.
  test.each([
    { target: 'solid', reactRefreshHooks: false },
    { target: 'react', reactRefreshHooks: true },
  ] as const)(
    'compiles for the target of a tsr.config.json in the Vite root ($target)',
    async ({ target, reactRefreshHooks }) => {
      const server = await routerDevServer({
        pluginOptions: null,
        plugins: [routerPackageStub(target)],
        files: {
          'tsr.config.json': JSON.stringify({
            target,
            routesDirectory: './routes',
            generatedRouteTree: './routeTree.gen.ts',
          }),
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({ loader: () => 'x', component: () => <p>x</p> })`,
        },
      })
      const window = {}
      vi.stubGlobal('window', window)
      try {
        // As the page loads it (router package and JSX runtime stubbed)
        const { Route } = await evaluateServed(server, '/routes/index.tsx', {
          skip: /^\/@id\/|\/node_modules\/|^\/@vite\b/,
          stubs: {
            [`/@id/__x00__@tanstack/${target}-router-stub`]: {
              createFileRoute: () => (options: unknown) => ({ options }),
            },
          },
          fallbackStub: (_, names) =>
            Object.fromEntries([...names].map((name) => [name, () => null])),
        })
        expect(await Route.options.loader()).toBe('x')
        expect(Object.keys(window).length > 0).toBe(reactRefreshHooks)
      } finally {
        vi.unstubAllGlobals()
      }
    },
    timeout,
  )

  test(
    'takes plugin options given as a function',
    async () => {
      const { tanstackRouter } = await import('../src/vite')
      const { getConfig } = await import('../src/core/config')
      const server = await createDevServer({
        dir: harnessDir,
        prefix: '.router-dev-server-',
        registerCleanup: onTestFinished,
        files: {
          'routes/__root.tsx': rootRouteOf('solid'),
          'routes/index.tsx': loaderRoute('solid'),
        },
        plugins: (app) => [
          tanstackRouter(() =>
            getConfig(
              {
                target: 'solid',
                autoCodeSplitting: false,
                routesDirectory: path.join(app.root, 'routes'),
                generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
              },
              app.root,
            ),
          ),
          routerPackageStub('solid'),
        ],
      })
      expect(
        hasRouteHmr(await server.transform('/routes/index.tsx', 'client')),
      ).toBe(true)
      const routeModule = await server.import('/routes/index.tsx')
      expect(await routeModule.Route.options.loader()).toBe('x')
    },
    timeout,
  )

  // Stack traces and breakpoints of route files in development.
  test.each(['react', 'solid', 'vue'] as const)(
    'maps the served %s route module to the lines of the route file',
    async (target) => {
      const route = `import { createFileRoute } from '@tanstack/${target}-router'


// comment

export const Route = createFileRoute('/')({
  loader: () => {
    const value = [1, 2, 3].map((n) => n * 2).filter((n) => n > 2)


    throw new Error('MARK_THROW ' + value.length)
  },
})
`
      const server = await routerDevServer({
        pluginOptions: { target, autoCodeSplitting: false },
        plugins: [routerPackageStub(target)],
        files: { 'routes/index.tsx': route },
      })
      const result =
        await server.vite.environments.client.transformRequest(
          '/routes/index.tsx',
        )
      const code = result!.code
      const before = code.slice(0, code.indexOf('throw new Error'))
      const line = before.split('\n').length - 1
      const column = before.length - before.lastIndexOf('\n') - 1
      const entry = new SourceMap(result!.map as any).findEntry(
        line,
        column,
      ) as { originalLine: number }
      expect(entry.originalLine + 1).toBe(
        route.slice(0, route.indexOf('throw new Error')).split('\n').length,
      )
    },
    timeout,
  )
})
