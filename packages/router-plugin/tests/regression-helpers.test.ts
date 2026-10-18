/**
 * Controls for the regression harness itself: module discovery, lazy
 * evaluation and output validation (module linking and module validation:
 * `@tanstack/compiler-test-utils`), and the route HMR page
 * (`route-hmr-page.ts`).
 */
import { describe, expect, it } from 'vitest'
import { routerDevServer } from './dev-server'
import {
  buildAndRun,
  compileRouteModules,
  componentChunk,
  expectRegisteredRouteOption,
  expectValidModules,
  generatedRouteId,
  head,
  hotUpdate,
  importRequests,
  importSources,
  loadRoute,
  routeModuleSources,
  routeSpecifier,
} from './regression-helpers'
import { openRouteHmrPage } from './route-hmr-page'

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

describe('loadRoute labels each lazy module by the route options that load it', () => {
  const options = [
    'loader',
    'component',
    'errorComponent',
    'notFoundComponent',
    'pendingComponent',
  ]
  const route = (groupings: string) => `${head}const shared = { value: 'v' }
export const Route = createFileRoute('/')({
  codeSplitGroupings: ${groupings},
${options.map((option) => `  ${option}: () => <p>{shared.value}${option}</p>,`).join('\n')}
})`

  it('finds the module of every lazy option without evaluating it', async () => {
    const loaded = await loadRoute(
      route(JSON.stringify(options.map((option) => [option]))),
    )
    expect(Object.keys(loaded.modules).sort()).toEqual([
      'lazy component',
      'lazy errorComponent',
      'lazy loader',
      'lazy notFoundComponent',
      'lazy pendingComponent',
      'reference',
      'shared',
    ])
    // Every module only imported lazily is labelled by an option.
    const lazyIds = [...loaded.graph.importKinds]
      .filter(([, kind]) => kind === 'dynamic')
      .map(([id]) => id)
      .sort()
    expect(
      options.map((option) => loaded.ids[`lazy ${option}`]).sort(),
    ).toEqual(lazyIds)
    expect(loaded.evaluated).toEqual([loaded.ids.reference])
    for (const option of options) {
      expect(loaded.chunkOf(option)).toBe(loaded.modules[`lazy ${option}`])
      const value = await loaded.load(option)
      expect(loaded.evaluated).toContain(loaded.ids[`lazy ${option}`])
      expect(value()).toBe(`<p>v${option}</p>`)
    }
  })

  it('labels a module that several options load with all of them', async () => {
    const loaded = await loadRoute(
      route(
        `[['loader', 'component'], ['errorComponent', 'notFoundComponent']]`,
      ),
    )
    expect(Object.keys(loaded.modules).sort()).toEqual([
      'lazy component+loader',
      'lazy errorComponent+notFoundComponent',
      'reference',
      'shared',
    ])
    expect(loaded.chunkOf('loader')).toBe(loaded.chunkOf('component'))
    expect(() => loaded.chunkOf('pendingComponent')).toThrow(
      'does not load one module',
    )
  })
})

describe('componentChunk', () => {
  it('stubs the imports of the route file and returns the component chunk', async () => {
    const chunk = await componentChunk(`${head}import { format } from './format'
import { label } from './label'
const prefix = label('route')
export const Route = createFileRoute('/')({
  loader: () => prefix,
  component: () => <p>{format('page')}</p>,
})`)
    expect(importSources(chunk)).toContain('./format')
    expect(importSources(chunk)).not.toContain('./label')
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
    expect((await route.load('component'))()).toBe('<p>1</p>')
    expect(other.read()).toEqual([1, 'object'])
    expect(route.exports.store).toBe(
      (await route.importFromRoute(`export { store } from '${routeSpecifier}'`))
        .store,
    )
  })
})

describe('buildAndRun', () => {
  // A real app's package.json has no side-effect hint unless the app adds
  // one: a module the route file imports for its side effect runs.
  it.each([
    { sideEffects: undefined, ran: true },
    { sideEffects: false, ran: false },
  ])(
    'keeps a side-effect import unless the app declares "sideEffects": $sideEffects',
    async ({ sideEffects, ran }) => {
      expect(
        await buildAndRun(
          `${head}import '../effect'
export const Route = createFileRoute('/')({ component: () => <p>page</p> })`,
          `return globalThis.effectRan === true`,
          {
            sideEffects,
            files: { 'effect.ts': `;(globalThis as any).effectRan = true\n` },
          },
        ),
      ).toBe(ran)
    },
    30_000,
  )
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
    expect([route.isLazy('component'), route.isLazy('loader')]).toEqual([
      true,
      false,
    ])
    expect(route.options.loader()).toBe('data')
    const component = await route.load('component')
    expect(route.evaluated).toEqual([
      route.ids.reference,
      route.ids['lazy component'],
    ])
    expect([component(), effects]).toEqual(['<p>2</p>', ['route', 'component']])
  })

  it('returns an option that is not split as it is', async () => {
    const route =
      await loadRoute(`import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <p>root</p> })`)
    expect(route.isLazy('component')).toBe(false)
    expect((await route.load('component'))()).toBe('<p>root</p>')
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

describe('expectRegisteredRouteOption', () => {
  it('rejects a component React Refresh does not register', async () => {
    await expect(
      expectRegisteredRouteOption(
        `${head}export const Route = createFileRoute('/')({ component: () => null })`,
        'component',
      ),
    ).rejects.toThrow('is not a component React Refresh registers')
  })

  it('returns the name React Refresh registers the component under', async () => {
    expect(
      await expectRegisteredRouteOption(
        `${head}function Page() { return null }
export const Route = createFileRoute('/')({ component: Page })`,
        'component',
      ),
    ).toBe('Page')
  })
})

describe('framework and plugin options', () => {
  it.each(['solid', 'vue'] as const)(
    'loadRoute compiles a %s route with its router package',
    async (framework) => {
      const route = await loadRoute(
        `import { createFileRoute } from '@tanstack/${framework}-router'
export const Route = createFileRoute('/')({
  component: () => <p>${framework}</p>,
})`,
        { targetFramework: framework },
      )
      expect(importSources(route.modules.reference!)).toContain(
        `@tanstack/${framework}-router`,
      )
      expect(importSources(route.modules.reference!)).not.toContain(
        '@tanstack/react-router',
      )
      expect(route.isLazy('component')).toBe(true)
      expect((await route.load('component'))()).toBe(`<p>${framework}</p>`)
    },
  )

  const route = `${head}export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>page</p>,
})`

  it('compileRouteModules and loadRoute take the code-splitting options of the plugin', async () => {
    const byDefault = await loadRoute(route)
    expect(byDefault.isLazy('loader')).toBe(false)

    const grouped = await loadRoute(route, {
      pluginOptions: {
        codeSplittingOptions: { defaultBehavior: [['loader', 'component']] },
      },
    })
    expect([grouped.isLazy('loader'), grouped.isLazy('component')]).toEqual([
      true,
      true,
    ])
    expect(Object.keys(grouped.modules)).toEqual([
      'reference',
      'lazy component+loader',
    ])
    expect(await (await grouped.load('loader'))()).toBe('data')

    const unsplit = compileRouteModules(route, {
      pluginOptions: {
        codeSplittingOptions: { splitBehavior: () => [] },
      },
    })
    expect(Object.keys(unsplit.modules)).toEqual(['reference'])
  })
})

describe('hotUpdate', () => {
  const route = (loader: string) => `${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({
  loader: () => '${loader}',
  component: Page,
})`

  it.each(['vite', 'webpack'] as const)(
    '%s: the live route gets the options of the updated module',
    async (style) => {
      const update = await hotUpdate(route('old'), {
        style,
        updated: route('new'),
      })
      expect((update.previous.loader as () => string)()).toBe('old')
      expect((update.live.loader as () => string)()).toBe('new')
      expect(update.created).toHaveLength(2)
      expect(update.invalidated).toBe(false)
    },
  )

  it.each(['vite', 'webpack'] as const)(
    '%s with code splitting: the split component stays lazy and the new loader applies',
    async (style) => {
      const update = await hotUpdate(route('old'), {
        style,
        codeSplitting: true,
        updated: route('new'),
      })
      expect((update.live.loader as () => string)()).toBe('new')
      expect(update.isLazy('component')).toBe(true)
      expect((await update.load('component'))()).toBe('<p>page</p>')
    },
  )

  it('a root route is updated as the root of the route tree', async () => {
    const root = (
      loader: string,
    ) => `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ loader: () => '${loader}' })`
    const update = await hotUpdate(root('old'), {
      routeId: await generatedRouteId('__root.tsx'),
      updated: root('new'),
    })
    expect((update.live.loader as () => string)()).toBe('new')
  })

  it('a Solid route is updated with the Solid router package', async () => {
    const solid = (
      loader: string,
    ) => `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ loader: () => '${loader}' })`
    const update = await hotUpdate(solid('old'), {
      style: 'webpack',
      targetFramework: 'solid',
      updated: solid('new'),
    })
    expect((update.live.loader as () => string)()).toBe('new')
  })
})

// Controls of the route HMR page (`openRouteHmrPage`): it tells kept state
// from lost state, and a hot update from a full reload. A React app whose
// route component renders a counter, and whose entry renders a header
// imported from a module that no HMR boundary accepts.
describe.each(['vite', 'rsbuild'] as const)(
  'openRouteHmrPage (%s)',
  (bundler) => {
    const route = (
      version: string,
      child = 'Counter',
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
function ${child}() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>${child} ${version} count {count}</button>
}
function Page() {
  return <div><${child} /></div>
}
export const Route = createFileRoute('/')({ component: Page })
`
    const main = `import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { header } from './header'
const router = createRouter({ routeTree })
createRoot(document.getElementById('app')!).render(
  <>
    <p>{header}</p>
    <RouterProvider router={router} />
  </>,
)
`

    it('sees kept state, lost state and full reloads', async () => {
      const app = await openRouteHmrPage({
        bundler,
        files: {
          'main.tsx': main,
          'header.ts': `export const header = 'header v1'`,
          'routes/index.tsx': route('v1'),
        },
        ready: 'Counter v1 count 0',
      })
      await app.click('button')
      await app.page.waitForText('Counter v1 count 1')
      // An edit of the component's body: React Refresh keeps its state.
      expect(
        await app.edit(
          { 'routes/index.tsx': route('v2') },
          'Counter v2 count 1',
        ),
      ).toEqual({ reloaded: false })
      // A component the edit renames is another component for React Refresh:
      // React mounts it anew.
      expect(
        await app.edit(
          { 'routes/index.tsx': route('v3', 'Renamed') },
          'Renamed v3 count 0',
        ),
      ).toEqual({ reloaded: false })
      // An edit of a module that no HMR boundary accepts reloads the page.
      expect(
        await app.edit(
          { 'header.ts': `export const header = 'header v2'` },
          'header v2',
        ),
      ).toEqual({ reloaded: true })
    }, 60_000)
  },
)

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
