import { describe, expect, it } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { tanstackRouter } from '../src/vite'
import {
  loadRouteOption,
  rootRoute,
  routerDevServer,
  routerPackageStub,
} from './dev-server'
import { createRouteLoader } from './regression-helpers'
import type { CodeSplitGroupings } from '../src/core/constants'

describe('router plugin context', () => {
  it('refreshes chunk ownership after source changes and isolates split settings', async () => {
    const source = (name: string, value: string) => `
import { createFileRoute } from '@tanstack/react-router'
const ${name} = { value: ${JSON.stringify(value)} }
export const Route = createFileRoute('/changing')({
  loader: () => ${name},
  component: () => ${name},
})`
    // One plugin instance per split setting, each compiling every version of
    // the file, as a dev server does.
    const load = (groupings: CodeSplitGroupings) =>
      createRouteLoader({
        routeId: '/changing',
        pluginOptions: {
          codeSplittingOptions: { defaultBehavior: groupings },
        },
      })
    const separate = load([['component'], ['loader']])
    const combined = load([['component', 'loader']])

    /** The loader's data and the object the component reads. */
    const read = async (route: Awaited<ReturnType<typeof separate>>) => {
      expect([route.isLazy('loader'), route.isLazy('component')]).toEqual([
        true,
        true,
      ])
      const data = await (await route.load('loader'))()
      expect((await route.load('component'))()).toBe(data)
      return data
    }

    expect(
      await read(await separate(source('firstState', 'first version'))),
    ).toEqual({ value: 'first version' })

    const second = await separate(source('secondState', 'second version'))
    for (const output of Object.values(second.modules)) {
      expect(output).not.toContain('firstState')
    }
    expect(await read(second)).toEqual({ value: 'second version' })
    expect(
      await read(await combined(source('secondState', 'second version'))),
    ).toEqual({ value: 'second version' })
    expect(
      (await separate(source('secondState', 'second version'))).modules,
    ).toEqual(second.modules)
  })

  // Two router plugins in one dev server (each with its own routes
  // directory and route tree): each compiles its own route files, once.
  it('keeps two router plugins of one dev server to their own route files', async () => {
    const route = (routePath: string, label: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
function Page() {
  return '${label}'
}
export const Route = createFileRoute('${routePath}')({ component: Page })
`
    const server = await routerDevServer({
      plugins: [
        routerPackageStub(),
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes-b',
          generatedRouteTree: './routeTree-b.gen.ts',
          autoCodeSplitting: true,
        }),
      ],
      files: {
        'routes/owned.tsx': route('/owned', 'owned'),
        'routes-b/__root.tsx': rootRoute,
        'routes-b/other.tsx': route('/other', 'other'),
      },
    })
    for (const [url, label] of [
      ['/routes/owned.tsx', 'owned'],
      ['/routes-b/other.tsx', 'other'],
    ]) {
      // Code added twice would declare its bindings twice.
      expect(await getModuleErrors(await server.transform(url!)), url).toEqual(
        [],
      )
      const { Route } = await server.import(url!)
      const component = await loadRouteOption(Route.options.component)
      expect(component, url).not.toBe(Route.options.component)
      expect((component as () => string)(), url).toBe(label)
    }
  }, 30_000)

  // The first edit of a route file through the public plugin setup
  // (`tanstackRouter({...})`) hot-updates the page:
  // integration/route-hmr-browser.test.ts (every test's first edit).
})
