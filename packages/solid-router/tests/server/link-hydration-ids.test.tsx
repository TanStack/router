import * as Solid from 'solid-js'
import { renderToString } from '@solidjs/web'
import { expect, test } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '../../src'

function Id() {
  return <i data-id={Solid.createUniqueId()} />
}

const CustomLink = createLink((props: Record<string, any>) => (
  <button {...props} />
))

function OwnAnchor() {
  const props = useLinkProps({ to: '/posts', class: 'own' })
  return (
    <a {...props}>
      <Id />
    </a>
  )
}

// The reactive path creates the client's owners, so its ids are the reference.
async function render(serverPath: boolean) {
  const rootRoute = createRootRoute()
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([postsRoute]),
    history: createMemoryHistory({ initialEntries: ['/posts?page=2'] }),
    isServer: serverPath,
    // A non-server router reads window.origin unless it is given one.
    origin: 'http://localhost',
  })
  await router.load()
  const html = renderToString(() => (
    <RouterContextProvider router={router}>
      {() => (
        <div>
          <Id />
          <Link to="/posts" search={{ page: 2 }} data-test="a">
            <Id />
          </Link>
          <Id />
          <Link
            to="/"
            activeProps={{ class: 'on' }}
            inactiveProps={{ class: 'off', style: { color: 'red' } }}
            class="base"
            type="x"
          >
            {({ isActive }) => <b data-active={String(isActive)} />}
          </Link>
          <Link to="/posts" disabled target="_blank" />
          <Link to="https://example.com" activeOptions={{ exact: true }}>
            <Id />
          </Link>
          <CustomLink to="/posts" id="custom">
            <Id />
          </CustomLink>
          <OwnAnchor />
          <Id />
        </div>
      )}
    </RouterContextProvider>
  ))
  // A server router also writes its dehydrated matches.
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
}

test('server Link renders the hydration keys and ids of the reactive path', async () => {
  const reactive = await render(false)
  const server = await render(true)
  expect(reactive).toMatch(/_hk=/)
  expect(server).toBe(reactive)
})
