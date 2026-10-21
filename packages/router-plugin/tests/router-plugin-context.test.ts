import { describe, expect, it } from 'vitest'
import { runInPage } from '@tanstack/compiler-test-utils/browser'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { tanstackRouter } from '../src/vite'
import { createReactDevPage, renderProbe } from './dev-page'
import { holdsMarker, loadRoute } from './route-app'
import type { CodeSplittingOptions } from '../src/vite'
import type { RouteApp } from './route-app'

type CodeSplitGroupings = NonNullable<CodeSplittingOptions['defaultBehavior']>

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
    // One dev server per split setting, each compiling every version of
    // the file as it is edited.
    const load = (groupings: CodeSplitGroupings) => (code: string) =>
      loadRoute(code, {
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
    const read = async (route: RouteApp, groups: Array<Array<string>>) => {
      const html = await route.run<string>('return renderRoute()')
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
    // No module of the edited route holds code of the first version.
    const secondModules = await second.modules()
    for (const [name, output] of Object.entries(secondModules.modules)) {
      expect(holdsMarker(output, 'first version'), name).toBe(false)
    }
    expect(await read(second, separateGroups)).toBe(
      '<p>second version true</p>',
    )
    expect(
      await read(await combined(source('secondState', 'second version')), [
        ['component', 'loader'],
      ]),
    ).toBe('<p>second version true</p>')
    // The same version compiled again by the same dev server (the file
    // written again, unchanged): the same modules, groups and behaviour
    // (SPEC G4; the emitted text is free).
    const again = await separate(source('secondState', 'second version'))
    await runInPage({ pageUrl: 'about:blank', script: 'return null' })
    await again.host.edit({ 'route.tsx': again.code })
    expect((await again.modules()).ids).toEqual(secondModules.ids)
    expect(await read(again, separateGroups)).toBe('<p>second version true</p>')
  }, 30_000)

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
    const rootRoute = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`
    const host = await createReactDevPage({
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/owned.tsx': route('/owned', 'owned'),
        'routes-b/__root.tsx': rootRoute,
        'routes-b/other.tsx': route('/other', 'other'),
      },
      plugins: () => [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
        }),
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes-b',
          generatedRouteTree: './routeTree-b.gen.ts',
          autoCodeSplitting: true,
        }),
      ],
    })
    for (const [url, label] of [
      ['/routes/owned.tsx', 'owned'],
      ['/routes-b/other.tsx', 'other'],
    ] as const) {
      // Code added twice would declare its bindings twice.
      expect(
        await getModuleErrors(await host.transform(url), 'module.tsx', {
          env: 'client',
        }),
        url,
      ).toEqual([])
      const run = await host.runClient(
        url,
        `const { render } = await import(${JSON.stringify(renderProbe)})
const { component } = module.Route.options
// Split: the option is the real router's lazy component of it
return ['preload' in component, await render(component)]`,
      )
      expect(run.result, url).toEqual([true, label])
      expect(run.errors, url).toEqual([])
    }
  }, 30_000)

  // The first edit of a route file through the public plugin setup
  // (`tanstackRouter({...})`) hot-updates the page:
  // integration/route-hmr-browser.test.ts (every test's first edit).
})
