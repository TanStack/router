/**
 * Controls for the regression harness itself: module discovery, lazy
 * evaluation and output validation (module linking and module validation:
 * `@tanstack/compiler-test-utils`). The route HMR page (`route-hmr-page.ts`):
 * integration/outside-compiler-corpus/regression-helpers.test.ts.
 *
 * Harness controls, outside the compiler test corpus (see
 * packages/compiler-test-utils/AGENTS.md): they check the test helpers, not
 * the compiler, and drive the current compiler where a rewrite may differ in
 * the incidental details they lean on. `test:implementation` runs them.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { routerDevServer } from '../dev-server'
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
  routeSpecifier,
} from './legacy/regression-helpers'
import { labelRouteModules, projectRoot } from './legacy/plugin-host'
import type { Plugin } from 'vite'
import type { RouteGraph } from './legacy/plugin-host'

describe('compileRouteModules', () => {
  // What the host finds is what the router plugin's output reaches; how
  // many modules a compiler emits is free (SPEC §5.3).
  it('returns the modules the output imports, and only those', async () => {
    const { modules, ids, graph } =
      await compileRouteModules(`${head}const shared = { value: 1 }
export const Route = createFileRoute('/')({
  loader: () => shared.value,
  component: () => <p>{shared.value}</p>,
})`)
    expect(Object.keys(modules).length).toBeGreaterThan(1)
    // Every module but the route module is imported by another one, and
    // resolves to the module the host compiled.
    for (const [label, id] of Object.entries(ids)) {
      if (label === 'reference') {
        continue
      }
      const importers = [...graph.modules].filter(([importer, code]) =>
        importRequests(code, importer).some(
          ({ specifier }) => graph.resolve(specifier, importer) === id,
        ),
      )
      expect(importers.length, label).toBeGreaterThan(0)
    }
  })
})

// The modules of a route are found by what the host's hooks did, whatever
// their ids (SPEC §5.3, V1R split S03): a module a plugin of the host
// serves under a virtual id is followed and evaluated like the router
// plugin's own; a real file of the app the plugins leave as it is is not a
// module of the route.
describe('the host follows the modules the plugins emit, whatever their ids', () => {
  const chunkId = '\0router:chunk:3f9a1c'
  const supportId = '\0router:support'
  /** Serves a chunk and a support module under ids of its own scheme. */
  const virtualModules = (): Plugin => ({
    name: 'test:virtual-route-modules',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'virtual:test-chunk') {
        return chunkId
      }
      if (source === 'virtual:test-support') {
        return supportId
      }
      return null
    },
    load(id) {
      if (id === chunkId) {
        return `import { createElement } from 'react'
import { label } from 'virtual:test-support'
export const Page = () => createElement('p', null, label)
`
      }
      if (id === supportId) {
        return `export const label = 'MARK_SUPPORT'\n`
      }
      return null
    },
  })
  const route = `import { createFileRoute } from '@tanstack/react-router'
import { Page } from 'virtual:test-chunk'
import { helper } from './user-helper'
export const Route = createFileRoute('/')({
  loader: () => helper,
  component: () => <Page />,
})
`

  it.each(['serve', 'build'] as const)(
    'follows and evaluates modules served under another id scheme, and not an untouched file of the app (%s)',
    async (command) => {
      await mkdir(path.join(projectRoot(), 'host-graph'), { recursive: true })
      await writeFile(
        path.join(projectRoot(), 'host-graph/user-helper.ts'),
        `export const helper = 'MARK_REAL_HELPER'\n`,
      )
      const options = {
        command,
        filename: 'host-graph/route.tsx',
        plugins: { before: [virtualModules()] },
      }
      const { graph } = await compileRouteModules(route, options)
      const ids = [...graph.modules.keys()]
      expect(ids).toEqual(expect.arrayContaining([chunkId, supportId]))
      expect(ids.filter((id) => id.includes('user-helper'))).toEqual([])

      const loaded = await loadRoute(route, {
        ...options,
        stubs: { './user-helper': { helper: 'MARK_STUBBED_HELPER' } },
      })
      expect(await loaded.render('component')).toBe('<p>MARK_SUPPORT</p>')
      expect(await (await loaded.load('loader'))()).toBe('MARK_STUBBED_HELPER')
    },
  )
})

// A plugin may report through the host's logger (`this.warn`) instead of
// the console (SPEC §5.7, V1R split S21): the host's warnings reach the
// console capture the diagnostic assertions read.
describe('the host reports what plugins log through it', () => {
  /** Warns about the files named `warned.tsx`, through the host. */
  const warner = (): Plugin => ({
    name: 'test:warner',
    enforce: 'pre',
    transform(_code, id) {
      if (id.includes('warned.tsx')) {
        this.warn('MARK_PLUGIN_WARNING about this route')
      }
      return null
    },
  })

  it.each(['serve', 'build'] as const)(
    'a warning a plugin logs through the host is captured with the console (%s)',
    async (command) => {
      const { diagnostics } = await captureConsole(() =>
        compileRouteModules(
          `${head}export const Route = createFileRoute('/')({ component: () => <p>warned</p> })`,
          { command, filename: 'warned.tsx', plugins: { before: [warner()] } },
        ),
      )
      expect(
        diagnostics.filter(
          ({ severity, text }) =>
            severity === 'warning' && text.includes('MARK_PLUGIN_WARNING'),
        ),
      ).not.toEqual([])
    },
  )
})

// The labels on a fixed graph, as a compiler could emit it (V1 split F06:
// harness bookkeeping independent of the compiler's output).
describe('labelRouteModules', () => {
  it('labels the route module, modules only imported lazily and modules imported statically', () => {
    const graph: RouteGraph = {
      id: '/route.tsx',
      modules: new Map([
        ['/route.tsx', ''],
        ['/route.tsx?lazy', ''],
        ['/route.tsx?shared', ''],
        ['/route.tsx?other-lazy', ''],
      ]),
      importKinds: new Map([
        ['/route.tsx?lazy', 'dynamic'],
        ['/route.tsx?shared', 'static'],
        ['/route.tsx?other-lazy', 'dynamic'],
      ]),
      resolve: () => undefined,
    }
    expect(labelRouteModules('', graph).ids).toEqual({
      reference: '/route.tsx',
      'lazy 1': '/route.tsx?lazy',
      shared: '/route.tsx?shared',
      'lazy 2': '/route.tsx?other-lazy',
    })
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
    // On the compiler's output, which modules exist is free (an eager
    // helper or a lazy facade is fine): the route's effect has run, the
    // component's has not, and rendering the component evaluates more of the
    // route's modules on demand. Exact bookkeeping: the fixed graphs above.
    expect(effects).toEqual(['route'])
    expect(route.evaluated).toContain(route.ids.reference)
    const evaluatedAtLoad = route.evaluated.length
    expect(route.options.loader()).toBe('data')
    expect([await route.render('component'), effects]).toEqual([
      '<p>2</p>',
      ['route', 'component'],
    ])
    expect(route.evaluated.length).toBeGreaterThan(evaluatedAtLoad)
  })

  // (A root component is not the control: splitting it is free, SPEC J2.7.)
  it('returns an option that is not split as it is', async () => {
    const route =
      await loadRoute(`${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [],
  component: () => <p>unsplit</p>,
})`)
    expect(await route.isLazy('component')).toBe(false)
    expect(await route.render('component')).toBe('<p>unsplit</p>')
  })
})

describe('output validation', () => {
  it('lets the modules of a route read the globals the route file reads', async () => {
    const { modules } =
      await compileRouteModules(`${head}export const Route = createFileRoute('/')({
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

    const unsplit = await compileRouteModules(route, {
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
    expect(await server.read('routes/__root.tsx')).toContain(
      '@tanstack/solid-router',
    )
  }, 30_000)
})
