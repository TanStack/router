/**
 * Controls for the regression harness itself: module discovery, lazy
 * evaluation and output validation (module linking and module validation:
 * `@tanstack/compiler-test-utils`).
 */
import react from '@vitejs/plugin-react'
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
import { editRouteFile } from './vite-hot-update'

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
      expect(await update.render('component')).toBe('<p>page</p>')
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

  it('refresh: modules are compiled with React Refresh and webpack enqueues a refresh', async () => {
    const update = await hotUpdate(route('old'), { style: 'webpack' })
    expect([...update.refresh.registered.values()]).toContain('Page')
    expect(update.refresh.refreshes).toBeGreaterThan(0)
    const without = await hotUpdate(route('old'), {
      style: 'webpack',
      refresh: false,
    })
    expect(without.refresh).toEqual({ registered: new Map(), refreshes: 0 })
  })

  // Controls of the React Refresh model: the page shows the new code of an
  // edited component in place, as React does with the real refresh runtime.
  describe('with React Refresh', () => {
    /** A route whose component (`name`) has `body`, split or not. */
    const page = (
      body: string,
      name = 'Page',
    ) => `${head}import { useState } from 'react'
function ${name}() {
  ${body}
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: ${name},
})`
    const modes = [
      { style: 'vite', codeSplitting: true },
      { style: 'webpack', codeSplitting: true },
      { style: 'vite', codeSplitting: false },
      { style: 'webpack', codeSplitting: false },
    ] as const

    it.each(modes)(
      '$style (codeSplitting: $codeSplitting): an edited component renders its new body, without a remount',
      async (mode) => {
        const update = await hotUpdate(page('return <p>v1</p>'), {
          ...mode,
          updated: page('return <p>v2</p>'),
        })
        expect(update.invalidated).toBe(false)
        expect(update.live.component).toBe(update.previous.component)
        expect(await update.render('component')).toBe('<p>v2</p>')
        expect(update.remounted('component')).toBe(false)
      },
    )

    // React keeps a component's state only while its hooks stay the same.
    it.each(modes)(
      '$style (codeSplitting: $codeSplitting): a component the edit adds a hook to remounts',
      async (mode) => {
        const update = await hotUpdate(page('return <p>v1</p>'), {
          ...mode,
          updated: page(`const [n] = useState(2)\n  return <p>{n}</p>`),
        })
        expect(update.invalidated).toBe(false)
        expect(update.remounted('component')).toBe(true)
      },
    )

    // Negative control: React Refresh matches the versions of a component
    // by the name it registers it under. Renamed, the edited component is
    // another component, and the page keeps rendering the previous one.
    it.each([true, false])(
      'vite (codeSplitting: %s): a renamed component is not a new version of the previous one',
      async (codeSplitting) => {
        const update = await hotUpdate(page('return <p>v1</p>'), {
          codeSplitting,
          updated: page('return <p>v2</p>', 'Renamed'),
        })
        expect(update.invalidated).toBe(false)
        expect(await update.render('component')).toBe('<p>v1</p>')
      },
    )

    // Without React Refresh, nothing patches a kept component.
    it('webpack without React Refresh: a kept component renders its first body', async () => {
      const update = await hotUpdate(page('return <p>v1</p>'), {
        style: 'webpack',
        refresh: false,
        updated: page('return <p>v2</p>'),
      })
      expect(update.live.component).toBe(update.previous.component)
      expect(await update.render('component')).toBe('<p>v1</p>')
    })
  })

  // Control: the Vite model agrees with a Vite dev server running
  // `@vitejs/plugin-react` on whether an edit is a hot update. Vite only takes
  // a module that accepts its own updates in its served code as a boundary;
  // an edit that reaches no boundary reloads the page.
  describe.each([
    {
      name: 'a split route',
      codeSplitting: true,
      file: 'index.tsx',
      route: (text: string) => `${head}function Page() {
  return <p>${text}</p>
}
export const Route = createFileRoute('/')({ loader: () => '${text}', component: Page })`,
    },
    {
      name: 'an unsplit route',
      codeSplitting: false,
      file: 'index.tsx',
      route: (text: string) => `${head}function Page() {
  return <p>${text}</p>
}
export const Route = createFileRoute('/')({ loader: () => '${text}', component: Page })`,
    },
    {
      name: 'an unsplit route without components (.ts)',
      codeSplitting: false,
      file: 'index.ts',
      route: (text: string) =>
        `${head}export const Route = createFileRoute('/')({ loader: () => '${text}' })`,
    },
    {
      name: 'an unsplit route whose options a factory call builds',
      codeSplitting: false,
      file: 'index.tsx',
      route: (text: string) => `${head}import { makeOptions } from './-options'
export const Route = createFileRoute('/')(makeOptions('${text}'))`,
    },
  ])('$name', ({ codeSplitting, file, route: source }) => {
    it('vite: reloads the page exactly when a Vite dev server does', async () => {
      const update = await hotUpdate(source('page'), {
        codeSplitting,
        filename: file,
        updated: source('edited'),
        stubs: {
          './-options': {
            makeOptions: (data: string) => ({ loader: () => data }),
          },
        },
      })
      const served = await editRouteFile({
        target: 'react',
        autoCodeSplitting: codeSplitting,
        plugins: [react()],
        file: `routes/${file}`,
        route: source,
        loaded: codeSplitting ? ['?tsr-split=component'] : [],
        files: {
          'routes/-options.ts': `export const makeOptions = (data: string) => ({ loader: () => data })`,
        },
      })
      expect(served.messages.length).toBeGreaterThan(0)
      expect(update.invalidated).toBe(!served.hotUpdate)
    }, 30_000)
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
