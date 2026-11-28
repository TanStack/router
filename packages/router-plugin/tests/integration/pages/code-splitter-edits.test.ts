/**
 * A route file edited on a running dev server (one router plugin per dev
 * server): the edited route's modules hold only the new version, and dev
 * servers with different split settings in one process keep their own.
 */
import { describe, expect, it } from 'vitest'
import { holdsMarker, loadRoute } from '../../route-app'
import type { CodeSplittingOptions } from '../../../src/vite'
import type { RouteApp } from '../../route-app'

type CodeSplitGroupings = NonNullable<CodeSplittingOptions['defaultBehavior']>

describe('a route file edited on a running dev server', () => {
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
    // ... and they hold the second version's (the same check finds the
    // route's code where it is)
    expect(
      Object.values(secondModules.modules).some((output) =>
        holdsMarker(output, 'second version'),
      ),
    ).toBe(true)
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
    await again.host.edit({ 'route.tsx': again.code })
    expect((await again.modules()).ids).toEqual(secondModules.ids)
    expect(await read(again, separateGroups)).toBe('<p>second version true</p>')
  }, 30_000)

  // The first edit of a route file through the public plugin setup
  // (`tanstackRouter({...})`) hot-updates the page:
  // integration/route-hmr-browser.test.ts (every test's first edit).
})
