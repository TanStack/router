import { describe, expect, it } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { tanstackRouter } from '../src/vite'
import { renderRouteComponent, rootRoute, routerDevServer } from './dev-server'
import { createRouteLoader } from './regression-helpers'
import type { CodeSplitGroupings } from '../src/core/constants'

describe('router plugin context', () => {
  it('refreshes chunk ownership after source changes and isolates split settings', async () => {
    const source = (name: string, value: string) => `
import { createFileRoute } from '@tanstack/react-router'
const ${name} = { value: ${JSON.stringify(value)} }
export const Route = createFileRoute('/changing')({
  loader: () => ${name},
  component: () => (
    <p>
      {${name}.value} {String(Route.useLoaderData() === ${name})}
    </p>
  ),
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

    /**
     * The route rendered by the router: the value the component reads and
     * whether the loader's data is that same object. Then checks which
     * options load together: activating an option of a group makes the
     * whole group available, another group stays unrequested.
     */
    const read = async (
      route: Awaited<ReturnType<typeof separate>>,
      groups: Array<Array<string>>,
    ) => {
      const html = await route.renderRoute()
      expect(await route.groups()).toEqual(groups)
      return html
    }
    const separateGroups = [['component'], ['loader']]

    expect(
      await read(
        await separate(source('firstState', 'first version')),
        separateGroups,
      ),
    ).toBe('<p>first version true</p>')

    const second = await separate(source('secondState', 'second version'))
    for (const output of Object.values(second.modules)) {
      expect(output).not.toContain('firstState')
    }
    expect(await read(second, separateGroups)).toBe(
      '<p>second version true</p>',
    )
    expect(
      await read(await combined(source('secondState', 'second version')), [
        ['component', 'loader'],
      ]),
    ).toBe('<p>second version true</p>')
    // The same version compiled again by the same instance: the same module
    // ids, groups and behaviour (SPEC G4; the emitted text is free).
    const again = await separate(source('secondState', 'second version'))
    expect(again.ids).toEqual(second.ids)
    expect(await read(again, separateGroups)).toBe('<p>second version true</p>')
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
      // Split: the option is the real router's lazy component of it
      expect(Route.options.component, url).toHaveProperty('preload')
      expect(await renderRouteComponent(Route.options.component), url).toBe(
        label,
      )
    }
  }, 30_000)

  // The first edit of a route file through the public plugin setup
  // (`tanstackRouter({...})`) hot-updates the page:
  // integration/route-hmr-browser.test.ts (every test's first edit).
})
