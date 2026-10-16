/**
 * Controls for the regression harness itself: module discovery, lazy
 * evaluation and output validation (module linking and module validation:
 * `@tanstack/compiler-test-utils`).
 */
import { describe, expect, it } from 'vitest'
import { routerDevServer } from './dev-server'
import {
  compileRouteModules,
  expectRegisteredRouteOption,
  expectValidModules,
  head,
  hotUpdate,
  importSources,
  loadRoute,
  routeModuleSources,
} from './regression-helpers'

describe('compileRouteModules', () => {
  const route = `${head}export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})`

  it('returns the modules the output imports, and only those', () => {
    const { modules, ids } = compileRouteModules(route)
    expect(Object.keys(modules)).toEqual(['reference', 'virtual component'])
    // Every module but the route module is imported by another one.
    const imported = Object.values(modules).flatMap((code) => [
      ...importSources(code),
      ...[...code.matchAll(/import\(['"]([^'"]+)['"]\)/g)].map(
        (match) => match[1]!,
      ),
    ])
    expect(imported).toContain(ids['virtual component'])
  })

  it('labels a module that the route module and a chunk import statically as shared', () => {
    const { modules, ids, sharedBindings } =
      compileRouteModules(`${head}const shared = { value: 1 }
export const Route = createFileRoute('/')({
  loader: () => shared.value,
  component: () => <p>{shared.value}</p>,
})`)
    expect(Object.keys(modules).sort()).toEqual([
      'reference',
      'shared',
      'virtual component',
    ])
    expect(routeModuleSources(modules.reference!)).toContain(ids.shared)
    expect(sharedBindings).toEqual(['shared'])
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
    expect([route.isLazy('component'), route.isLazy('loader')]).toEqual([
      true,
      false,
    ])
    expect(route.options.loader()).toBe('data')
    const component = await route.load('component')
    expect(route.evaluated).toEqual([
      route.ids.reference,
      route.ids['virtual component'],
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
      'virtual component-loader',
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
      routeId: '/__root',
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
      targetFramework: 'solid',
      updated: solid('new'),
    })
    expect((update.live.loader as () => string)()).toBe('new')
  })

  it('the route module starts with initialData as its hot data', async () => {
    const reads = `${head}export const marker = import.meta.hot?.data.marker
export const Route = createFileRoute('/')({ loader: () => marker })`
    const update = await hotUpdate(reads, {
      initialData: { marker: 'seeded' },
    })
    expect((update.live.loader as () => string)()).toBe('seeded')
    const unseeded = await hotUpdate(reads)
    expect((unseeded.live.loader as () => unknown)()).toBeUndefined()
  })

  it('refresh: modules are compiled with React Refresh and webpack enqueues a refresh', async () => {
    const update = await hotUpdate(route('old'), {
      style: 'webpack',
      refresh: true,
    })
    expect([...update.refresh.registered.values()]).toContain('Page')
    expect(update.refresh.refreshes).toBeGreaterThan(0)
    const without = await hotUpdate(route('old'), { style: 'webpack' })
    expect(without.refresh).toEqual({ registered: new Map(), refreshes: 0 })
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
