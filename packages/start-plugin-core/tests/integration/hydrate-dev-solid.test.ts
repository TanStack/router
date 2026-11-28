import solid from 'vite-plugin-solid'
import { describe, expect, test } from 'vitest'
import { openTestPage } from '../test-page'
import { startDevServer } from '../dev-server'
import {
  editLoadedChild,
  expectEditsReached,
  expectRouteBoundaryCounts,
  solidApp,
  solidRouteWithBoundary,
  solidWidgets,
} from './hydrate-dev-edits'

describe('Vite dev, Solid', () => {
  // A Solid boundary is served with the Solid packages, its chunk renders,
  // and an edit reaches it (replaces a former row that used stand-in
  // packages: here the real packages, with Solid's hot updates).
  test('a loaded child hot-updates in place, and a sibling opened later shows the edited version', async () => {
    const server = await startDevServer({
      start: {},
      framework: 'solid',
      browser: true,
      plugins: [solid({ ssr: true })],
      files: {
        ...solidApp,
        'src/widgets.tsx': solidWidgets('<i>v1</i>', 'capture-v1'),
      },
    })
    const browser = await openTestPage(server.url!)
    await browser.waitForText('hydrated', {
      selector: '[data-testid=hydrated]',
    })
    await server.idle()
    expectEditsReached(await editLoadedChild(server, browser, solidWidgets))
    expect(browser.loads()).toBe(1)
    expect(browser.errors).toEqual([])
  })

  // A boundary in the split route component itself: the route's chunk is
  // split again, and each module still gets Solid's JSX transform.
  test('a boundary written in a split route component loads on a click, hydrates and counts', async () => {
    const server = await startDevServer({
      start: {},
      framework: 'solid',
      browser: true,
      plugins: [solid({ ssr: true })],
      files: { ...solidApp, ...solidRouteWithBoundary },
    })
    const browser = await openTestPage(server.url!)
    await expectRouteBoundaryCounts(browser)
  })
})
