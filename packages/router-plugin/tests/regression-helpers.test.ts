/**
 * Controls for the regression harness itself: module discovery, lazy
 * evaluation and output validation (module linking and module validation:
 * `@tanstack/compiler-test-utils`). The route HMR page (`route-hmr-page.ts`):
 * integration/regression-helpers.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { routerDevServer } from './dev-server'
import {
  compileRouteModules,
  componentModules,
  evaluateModule,
  expectValidModules,
  head,
  importRequests,
  importSources,
  loadRoute,
  loadRouteGraph,
  renderComponent,
  routeModuleSources,
  routeSpecifier,
} from './regression-helpers'
import type { RouteGraph } from './plugin-host'

describe('compileRouteModules', () => {
  const route = `${head}export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})`

  it('returns the modules the output imports, and only those', () => {
    const { modules, ids } = compileRouteModules(route)
    expect(Object.keys(modules)).toEqual(['reference', 'lazy 1'])
    // Every module but the route module is imported by another one.
    const imported = Object.values(modules).flatMap((code) =>
      importRequests(code).map((request) => request.specifier),
    )
    expect(imported).toContain(ids['lazy 1'])
  })

  it('labels a module that the route module and a chunk import statically as shared', () => {
    const { modules, ids } =
      compileRouteModules(`${head}const shared = { value: 1 }
export const Route = createFileRoute('/')({
  loader: () => shared.value,
  component: () => <p>{shared.value}</p>,
})`)
    expect(Object.keys(modules).sort()).toEqual([
      'lazy 1',
      'reference',
      'shared',
    ])
    expect(routeModuleSources(modules.reference!)).toContain(ids.shared)
  })
})

/**
 * A fixed route graph, as a compiler could emit it, with the route module
 * at `/route.tsx`: `modules` by id, each id importable by its own name.
 */
function fixedGraph(modules: Record<string, string>): RouteGraph {
  const ids = new Map(Object.entries(modules))
  const importKinds = new Map<string, 'static' | 'dynamic'>()
  for (const [id, code] of ids) {
    for (const { specifier, dynamic } of importRequests(code, id)) {
      if (ids.has(specifier) && importKinds.get(specifier) !== 'static') {
        importKinds.set(specifier, dynamic ? 'dynamic' : 'static')
      }
    }
  }
  return {
    id: '/route.tsx',
    modules: ids,
    importKinds,
    resolve: (specifier) => (ids.has(specifier) ? specifier : undefined),
  }
}

// Controls of what `loadRoute` observes, on fixed graphs (not the code
// splitter's output): laziness, loading and grouping through the router's
// lazy contract and the modules requested, whatever helper builds a lazy
// value and however many modules a group loads (SPEC J2.6, §5.3, §5.8).
describe('loadRoute observes lazy options by their loading', () => {
  const route = `import { createFileRoute, lazyRouteComponent, lazyFn } from '@tanstack/react-router'
import { shared } from '/shared.tsx'
export const Route = createFileRoute('/')({
  loader: lazyFn(() => import('/loader.tsx'), 'loader'),
  component: lazyRouteComponent(() => import('/component.tsx'), 'component'),
  errorComponent: () => <p>error {shared}</p>,
})`
  const modules = {
    '/route.tsx': route,
    '/shared.tsx': `export const shared = 'shared'`,
    '/loader.tsx': `import { heavy } from './heavy'
export const loader = () => heavy`,
    '/component.tsx': `import { shared } from '/shared.tsx'
export const component = () => <p>page {shared}</p>`,
  }
  const stubs = { './heavy': { heavy: 'heavy data' } }

  it('tells lazy options from eager ones without loading them', async () => {
    const loaded = await loadRouteGraph(fixedGraph(modules), { stubs })
    expect(
      await Promise.all(
        ['loader', 'component', 'errorComponent', 'pendingComponent'].map(
          (option) => loaded.isLazy(option),
        ),
      ),
    ).toEqual([true, true, false, false])
    expect(loaded.evaluated).toEqual(['/shared.tsx', '/route.tsx'])
    expect(loaded.eager).not.toContain('./heavy')
    expect(loaded.eager).toContain('/shared.tsx')
  })

  it('loads, renders and calls options the way the router does', async () => {
    const loaded = await loadRouteGraph(fixedGraph(modules), { stubs })
    expect([
      await loaded.render('component'),
      await loaded.render('errorComponent'),
      await loaded.options.loader(),
      await loaded.renderRoute(),
    ]).toEqual([
      '<p>page shared</p>',
      '<p>error shared</p>',
      'heavy data',
      '<p>page shared</p>',
    ])
    expect(loaded.evaluated).toEqual([
      '/shared.tsx',
      '/route.tsx',
      '/component.tsx',
      '/loader.tsx',
    ])
    expect(loaded.requested).toContain('./heavy')
  })

  it('gives the modules loading an option evaluates, and its groups', async () => {
    const loaded = await loadRouteGraph(fixedGraph(modules), { stubs })
    expect(await loaded.loadedBy('component')).toEqual([
      modules['/component.tsx'],
    ])
    expect(await loaded.loadedBy('loader')).toEqual([modules['/loader.tsx']])
    await expect(loaded.loadedBy('errorComponent')).rejects.toThrow(
      'loads no module',
    )
    expect(await loaded.groups()).toEqual([['component'], ['loader']])
    // Observed in forks: the route the test inspects loaded nothing more.
    expect(loaded.evaluated).toEqual(['/shared.tsx', '/route.tsx'])
  })

  // Another valid compiler: its own lazy wrapper, an intermediate module
  // loading a group's modules, and the grouped options in other modules.
  it('accepts an equivalent wrapper and an intermediate module', async () => {
    const loaded = await loadRouteGraph(
      fixedGraph({
        '/route.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createElement } from 'react'
const group = () => import('/group.tsx')
let Loaded
function Page(props) {
  return createElement(Loaded, props)
}
Page.preload = async () => {
  Loaded = (await group()).Page
}
export const Route = createFileRoute('/')({
  loader: async (context) => (await group()).loader(context),
  component: Page,
})`,
        '/group.tsx': `export { Page } from '/page.tsx'
export { loader } from '/data.tsx'`,
        '/page.tsx': `export const Page = () => <p>page</p>`,
        '/data.tsx': `export const loader = () => 'data'`,
      }),
    )
    expect([
      await loaded.isLazy('component'),
      await loaded.isLazy('loader'),
    ]).toEqual([true, true])
    expect(await loaded.groups()).toEqual([['component', 'loader']])
    expect((await loaded.loadedBy('component')).length).toBe(3)
    expect([
      await loaded.render('component'),
      await loaded.options.loader(),
    ]).toEqual(['<p>page</p>', 'data'])
  })

  // A wrong compiler: the component's module imports the error
  // component's module, so the error component loads with the component
  // (but not the reverse).
  it('shows an independent group that loads with another one', async () => {
    const loaded = await loadRouteGraph(
      fixedGraph({
        '/route.tsx': `import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: lazyRouteComponent(() => import('/component.tsx'), 'component'),
  errorComponent: lazyRouteComponent(() => import('/error.tsx'), 'errorComponent'),
})`,
        '/component.tsx': `import '/error.tsx'
export const component = () => <p>page</p>`,
        '/error.tsx': `export const errorComponent = () => <p>error</p>`,
      }),
    )
    expect(await loaded.groups()).toEqual([
      ['component', 'errorComponent'],
      ['errorComponent'],
    ])
  })

  it('renders the route through the real router, with its hooks', async () => {
    const loaded = await loadRouteGraph(
      fixedGraph({
        '/route.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
  loader: () => ['a', 'b'],
  component: () => <p>{Route.useLoaderData().length} {Route.useSearch().page} {Route.fullPath}</p>,
})`,
      }),
      { routeId: '/posts' },
    )
    expect(await loaded.renderRoute({ at: '/posts?page=3' })).toBe(
      '<p>2 3 /posts</p>',
    )
  })
})

describe('componentModules', () => {
  it('stubs the imports of the route file and returns the modules of the component', async () => {
    const loaded =
      await componentModules(`${head}import { format } from './format'
import { label } from './label'
const prefix = label('route')
export const Route = createFileRoute('/')({
  loader: () => prefix,
  component: () => <p>{format('page')}</p>,
})`)
    expect(loaded.flatMap((code) => importSources(code))).toContain('./format')
    expect(loaded.flatMap((code) => importSources(code))).not.toContain(
      './label',
    )
  })
})

describe('importFromRoute', () => {
  it('evaluates another module importing the instance of the route module', async () => {
    const route = await loadRoute(`${head}export const store = { count: 0 }
export const Route = createFileRoute('/')({
  component: () => <p>{++store.count}</p>,
})`)
    const other =
      await route.importFromRoute(`import { store, Route } from '${routeSpecifier}'
export const read = () => [store.count, typeof Route]`)
    expect(await route.render('component')).toBe('<p>1</p>')
    expect(other.read()).toEqual([1, 'object'])
    expect(route.exports.store).toBe(
      (await route.importFromRoute(`export { store } from '${routeSpecifier}'`))
        .store,
    )
  })
})

describe('loadRoute', () => {
  it('evaluates the route module first and a split option when it loads', async () => {
    const effects: Array<string> = []
    const route = await loadRoute(
      `${head}import { track } from './track'
track('route')
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{track('component')}</p>,
})`,
      {
        stubs: { './track': { track: (label: string) => effects.push(label) } },
      },
    )
    expect(route.evaluated).toEqual([route.ids.reference])
    expect(route.options.loader()).toBe('data')
    expect([await route.render('component'), effects]).toEqual([
      '<p>2</p>',
      ['route', 'component'],
    ])
    expect(route.evaluated).toEqual([route.ids.reference, route.ids['lazy 1']])
  })

  it('returns an option that is not split as it is', async () => {
    const route =
      await loadRoute(`import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <p>root</p> })`)
    expect(await route.isLazy('component')).toBe(false)
    expect(await route.render('component')).toBe('<p>root</p>')
  })
})

describe('output validation', () => {
  it('lets the modules of a route read the globals the route file reads', async () => {
    const { modules } =
      compileRouteModules(`${head}export const Route = createFileRoute('/')({
  component: () => <p>{APP_VERSION}</p>,
})`)
    await expectValidModules(modules)
    await expect(
      expectValidModules({ chunk: 'export const read = () => APP_VERSION' }),
    ).rejects.toThrow()
  })
})

describe('framework and plugin options', () => {
  it('loadRoute compiles a vue route with its router package and renders it with Vue', async () => {
    const route = await loadRoute(
      `import { createFileRoute } from '@tanstack/vue-router'
export const Route = createFileRoute('/')({
  loader: () => ['a'],
  component: () => {
    const data = Route.useLoaderData()
    return <p>vue {data.value.length}</p>
  },
})`,
      { targetFramework: 'vue' },
    )
    expect(await route.isLazy('component')).toBe(true)
    // Vue's SSR output carries fragment markers
    expect((await route.renderRoute()).replace(/<!--.*?-->/g, '')).toBe(
      '<p>vue 1</p>',
    )
  })

  // The Solid router ships JSX source for bundlers (`solid` condition): it
  // cannot be linked in process. Real Solid builds: build-frameworks.test.ts.
  it('renders a Solid component with the Solid plugin and Solid SSR', async () => {
    const { Page } = await evaluateModule(
      `export const Page = (props: { name: string }) => <p>solid {props.name}</p>`,
      {},
      { framework: 'solid' },
    )
    // Solid's SSR output carries hydration keys and markers
    const html = await renderComponent(Page, { name: 'x' }, 'solid')
    expect(html.replace(/<!--.*?-->| data-hk="[^"]*"/g, '')).toBe(
      '<p>solid x</p>',
    )
  })

  const route = `${head}export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>page</p>,
})`

  it('compileRouteModules and loadRoute take the code-splitting options of the plugin', async () => {
    const byDefault = await loadRoute(route)
    expect(await byDefault.isLazy('loader')).toBe(false)

    const grouped = await loadRoute(route, {
      pluginOptions: {
        codeSplittingOptions: { defaultBehavior: [['loader', 'component']] },
      },
    })
    expect(await grouped.groups()).toEqual([['component', 'loader']])
    expect(await (await grouped.load('loader'))()).toBe('data')

    const unsplit = compileRouteModules(route, {
      pluginOptions: {
        codeSplittingOptions: { splitBehavior: () => [] },
      },
    })
    expect(Object.keys(unsplit.modules)).toEqual(['reference'])
  })
})

describe('routerDevServer', () => {
  it('serves a route of another target with the extra plugins after the router plugin', async () => {
    const stubId = '\0solid-router-stub'
    const server = await routerDevServer({
      pluginOptions: { target: 'solid' },
      plugins: [
        {
          name: 'solid-router-stub',
          // Before Vite's resolver, which finds the installed package
          enforce: 'pre',
          resolveId: (id) =>
            id === '@tanstack/solid-router' ? stubId : undefined,
          load: (id) =>
            id === stubId
              ? `export const createFileRoute = () => (options) => ({ options })
export const createRootRoute = (options) => ({ options })
export const lazyRouteComponent = () => () => null`
              : undefined,
        },
      ],
      files: {
        'routes/index.tsx': `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ component: () => 'page' })`,
      },
    })
    const served = await server.transform('/routes/index.tsx')
    expect(served).toContain('solid-router-stub')
    expect(served).toContain('tsr-split')
    expect(await server.read('routes/__root.tsx')).toContain(
      '@tanstack/solid-router',
    )
  }, 30_000)
})
