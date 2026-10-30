/**
 * A route file exports a non-component value another module renders (a
 * label object, like the query options a navbar prefetches with). An edit of
 * that value shows on the page (SPEC J3.3), in place or after a reload; with
 * React and `@vitejs/plugin-react` on Vite.
 */
import { expect, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'

const timeout = 60_000

const route = (label: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const navLabel = { text: '${label}' }
export const Route = createFileRoute('/')({
  component: Page,
})
function Page() {
  return <p data-probe="page">page</p>
}
`

// Bug (main showed the edit): the route module's React Refresh boundary
// ignores every module-level export, so plugin-react never invalidates it;
// the route module accepts itself and `nav.tsx` keeps the old `navLabel`.
test.fails(
  "an edit of a route file's exported value shows in the module that imports it",
  async ({ onTestFinished }) => {
    const app = await openRouteHmrPage({
      onTestFinished,
      files: {
        'routes/__root.tsx': `import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Nav } from '../nav'
export const Route = createRootRoute({
  component: () => (
    <>
      <Nav />
      <Outlet />
    </>
  ),
})
`,
        'nav.tsx': `import { navLabel } from './routes/index'
export function Nav() {
  return <nav data-probe="nav">{navLabel.text}</nav>
}
`,
        'routes/index.tsx': route('label-v1'),
      },
      ready: 'label-v1',
    })
    const { errors } = await app.edit(
      { 'routes/index.tsx': route('label-v2') },
      'label-v2',
    )
    expect(errors).toEqual([])
  },
  timeout,
)
