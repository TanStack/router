import { test } from '../test'
/**
 * A route file renamed on a Vite dev server while the page shows another
 * route: the route tree changes and the page reloads with it, without a
 * failed request or a failed update on the way (nothing is sent for the
 * removed file before the reload; Vite's own removal event is what main
 * sends too), and the renamed route works.
 * Source: coverage review D, D-1 (the update of the removed file reached the
 * page before the reload: `Failed to load resource: 404`, `[vite] Failed to
 * reload /src/routes/about.tsx`).
 */

/** The index route, listing the router's routes by path. */
const index = `import { createFileRoute, useRouter } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  const router = useRouter()
  return <p>routes: {Object.keys(router.routesByPath).sort().join(' ')}</p>
}
`

const page = (path: string, label: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${path}')({ component: () => <p>${label}</p> })
`

test('vite: renaming a route file the page does not show reloads the page without a failed update', async ({
  expect,
  openRouteHmrPage,
}) => {
  const app = await openRouteHmrPage({
    files: {
      'routes/index.tsx': index,
      'routes/about.tsx': page('/about', 'about v1'),
    },
    ready: /routes: .*\/about/,
  })
  const renamed = await app.edit(
    { 'routes/about.tsx': null, 'routes/info.tsx': page('/info', 'info v1') },
    /routes: (?!.*\/about).*\/info/,
  )
  expect(renamed.errors).toEqual([])
  await app.evaluate(`window.__APP_ROUTER__.navigate({ to: '/info' })`)
  await app.page.waitForText('info v1', { selector: '#app' })
  const edited = await app.edit(
    { 'routes/info.tsx': page('/info', 'info v2') },
    'info v2',
  )
  expect(edited.errors).toEqual([])
})
