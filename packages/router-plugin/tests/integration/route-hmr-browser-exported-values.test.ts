/**
 * A route file exports a non-component value another module renders (a
 * label object, like the query options a navbar prefetches with). An edit of
 * that value shows on the page (SPEC J3.3), in place or after a reload; with
 * React and `@vitejs/plugin-react` on Vite.
 */
import { expect } from 'vitest'
import { test } from '../test'

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

// plugin-react validates the route file's own exports (only the route and
// the compiler's glue are ignored): the edited value invalidates the route
// module, so `nav.tsx` gets the new `navLabel`, as on main.
test("an edit of a route file's exported value shows in the module that imports it", async ({
  openRouteHmrPage,
}) => {
  const app = await openRouteHmrPage({
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
  // (split: the route's component loads from its chunk)
  expect(app.splitOutputs()).toBeGreaterThan(0)
  const { errors } = await app.edit(
    { 'routes/index.tsx': route('label-v2') },
    'label-v2',
  )
  expect(errors).toEqual([])
})

// The split component reads the value too, so its chunk imports it from the
// route module, under the user's export name: that export is still the
// user's, validated by plugin-react, and `nav.tsx` gets the edit.
const aliasedRoute = (label: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
const makeLabel = (text: string) => ({ text })
const label = makeLabel('${label}')
export { label as navLabel }
export const Route = createFileRoute('/')({
  component: Page,
})
function Page() {
  return <p data-probe="page">page {label.text.length}</p>
}
`

test("an edit of a route file's value exported under another name, which the split component reads, shows in the module that imports it", async ({
  openRouteHmrPage,
}) => {
  const app = await openRouteHmrPage({
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
      'routes/index.tsx': aliasedRoute('label-v1'),
    },
    ready: 'label-v1',
  })
  const { errors } = await app.edit(
    { 'routes/index.tsx': aliasedRoute('label-v2') },
    'label-v2',
  )
  expect(errors).toEqual([])
})

// The route file is also a barrel (`export *`), and a private binding has the
// name of a value the star re-exports: plugin-react still validates the
// star's export, so `nav.tsx` gets the value of the newly re-exported module.
const barrelRoute = (from: string, page: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export * from '../${from}'
const label = 'private'
export const Route = createFileRoute('/')({
  component: Page,
})
function Page() {
  return <p data-probe="page">${page} {label}</p>
}
`

test('an edit of what a route file re-exports with `export *` shows in the module that imports it, with a private binding of the same name', async ({
  openRouteHmrPage,
}) => {
  const app = await openRouteHmrPage({
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
      'nav.tsx': `import { label } from './routes/index'
export function Nav() {
  return <nav data-probe="nav">{label}</nav>
}
`,
      'one.ts': `export const label = 'menu one'\n`,
      'two.ts': `export const label = 'menu two'\n`,
      'routes/index.tsx': barrelRoute('one', 'page1'),
    },
    ready: 'menu onepage1 private',
  })
  const { errors } = await app.edit(
    { 'routes/index.tsx': barrelRoute('two', 'page2') },
    'menu twopage2 private',
  )
  expect(errors).toEqual([])
})
