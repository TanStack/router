/**
 * The order of the router plugin and the framework's JSX plugin in an
 * app's Vite config. Route splitting reads the route file's source, so
 * with `autoCodeSplitting` the router plugin must come first: the dev
 * server refuses to start otherwise. Without splitting, the route HMR
 * block is appended to whatever the framework plugin emitted, so an app
 * listing `react()` (or `solid()`) before `tanstackRouter()` keeps route
 * HMR: an edit shows in place without a full reload, the component React
 * Refresh patches keeps its state, and no warning is reported.
 *
 * Concurrent: each test has its own dev server and page.
 */
import { describe, test } from 'vitest'
import { countMounts, mountsOf, openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const timeout = 90_000

const reactRoute = (version: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createFileRoute('/')({
  component: Page,
})
function Page() {
  ${countMounts('page')}
  const [count, setCount] = useState(0)
  return <p>page ${version} count {count} <button onClick={() => setCount((c) => c + 1)}>+</button></p>
}
`

const reactInlineRoute = (version: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createFileRoute('/')({
  component: () => {
    ${countMounts('page')}
    const [count, setCount] = useState(0)
    return <p>inline ${version} count {count} <button onClick={() => setCount((c) => c + 1)}>+</button></p>
  },
})
`

const solidRoute = (version: string) =>
  `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p>page ${version} {data()}</p>
}
`

describe.concurrent('the framework plugin before the router plugin', () => {
  test.for([
    { name: 'a named component', route: reactRoute, shows: 'page' },
    { name: 'an inline component', route: reactInlineRoute, shows: 'inline' },
  ])(
    'react, autoCodeSplitting off: an edit of $name shows in place, keeping its state, without a warning',
    { timeout },
    async ({ route, shows }, { expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        frameworkPluginFirst: true,
        pluginOptions: { autoCodeSplitting: false },
        files: { 'routes/index.tsx': route('v1') },
        ready: `${shows} v1 count 0`,
      })
      await app.click('button')
      await app.page.waitForText(`${shows} v1 count 1`, { selector: '#app' })
      const mounts = await mountsOf(app)
      expect(Object.keys(mounts)).not.toEqual([])
      expect(
        await app.edit(
          { 'routes/index.tsx': route('v2') },
          `${shows} v2 count 1`,
        ),
      ).toEqual({ reloaded: false, errors: [] })
      expect(await mountsOf(app)).toEqual(mounts)
      expect(app.warnings()).toEqual([])
    },
  )

  test(
    'solid, autoCodeSplitting off: an edit shows in place without a warning',
    { timeout },
    async ({ expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        target: 'solid',
        onTestFinished,
        frameworkPluginFirst: true,
        pluginOptions: { autoCodeSplitting: false },
        files: { 'routes/index.tsx': solidRoute('v1') },
        ready: 'page v1 data v1',
      })
      expect(
        await app.edit(
          { 'routes/index.tsx': solidRoute('v2') },
          'page v2 data v2',
        ),
      ).toEqual({ reloaded: false, errors: [] })
      expect(app.warnings()).toEqual([])
    },
  )

  test.for(['react', 'solid'] as const)(
    '%s, autoCodeSplitting on: the dev server refuses to start',
    { timeout },
    async (target, { expect, onTestFinished }: TestContext) => {
      await expect(
        openRouteHmrPage({
          target,
          onTestFinished,
          frameworkPluginFirst: true,
          pluginOptions: { autoCodeSplitting: true },
          files: {
            'routes/index.tsx':
              target === 'react' ? reactRoute('v1') : solidRoute('v1'),
          },
          ready: /./,
        }),
      ).rejects.toThrow()
    },
  )
})
