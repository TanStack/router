// Solid's observe tier: the match publish inside `startTransition` is
// declared to the attribution engine as the navigation, so the holds and
// re-runs it causes are named after the route and the record spans from
// the history change that started the load; the route the document arrived
// on is declared when the Transitioner establishes the initial match.
// `OBSERVE` is defined on the dev build the tests resolve; in production it
// is undefined and the declarations fold out.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { OBSERVE } from 'solid-js'
import { attribution, feedback } from 'solid-js/attribution'
import { z } from 'zod'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'

beforeEach(() => attribution.enable({ log: false }))
afterEach(() => {
  attribution.disable()
  cleanup()
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const navigations = () =>
  attribution.history('navigation').filter((nav) => !nav.initial)

function makeRouter(loaderMs: number, initialEntry = '/') {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link to="/users/$id" params={{ id: '7' }} data-testid="link">
          User 7
        </Link>
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="home">Home</div>,
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    validateSearch: z.object({ tab: z.string().default('info') }),
    component: () => <div data-testid="about">About</div>,
  })
  const userRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users/$id',
    loader: async ({ params }) => {
      await sleep(loaderMs)
      return { name: `user ${params.id}` }
    },
    component: () => {
      const data = userRoute.useLoaderData()
      return <div data-testid="user">{data().name}</div>
    },
  })
  const postRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts/$postId',
    params: {
      parse: ({ postId }) => ({ postId: Number(postId) }),
      stringify: ({ postId }) => ({ postId: String(postId) }),
    },
    component: () => <div data-testid="post">Post</div>,
  })
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    beforeLoad: () => {
      throw redirect({ to: '/login' })
    },
    component: () => <div data-testid="dashboard">Dashboard</div>,
  })
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <div data-testid="login">Login</div>,
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    aboutRoute,
    userRoute,
    postRoute,
    dashboardRoute,
    loginRoute,
  ])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
}

test('mounting declares the route the document arrived on — the first record, initial', async () => {
  const router = makeRouter(30, '/users/42?tab=posts')
  render(() => <RouterProvider router={router} />)
  // Delivered as the Transitioner established the initial match: nothing to
  // wait for, so the record settled before the loader ran.
  expect(attribution.history('navigation')).toHaveLength(1)
  const nav = attribution.history('navigation')[0]!
  expect(nav.initial).toBe(true)
  expect(nav.name).toBe('/users/$id')
  expect(nav.to).toBe('/users/42?tab=posts')
  expect(nav.params).toEqual({ id: '42' })
  expect(nav.from).toBeUndefined()
  expect(nav.interaction).toBeUndefined()
  // The document's own navigation start on the performance clock.
  expect(nav.at).toBe(0)
  expect(nav.writes).toBe(0)
  expect(nav.outcome).toBe('committed')

  // The initial load publishes matches for the location already shown: not
  // a navigation.
  await waitFor(() => expect(screen.getByTestId('user')).toBeTruthy())
  await sleep(0)
  expect(attribution.history('navigation')).toHaveLength(1)
})

test.each([false, true])(
  'an arrival the router canonicalizes is the one initial record, naming the canonical location (loaded before mount: %s)',
  async (preloaded) => {
    // `/about` validates to `/about?tab=info`; the Transitioner commits the
    // canonical location as it establishes the initial match. That write is
    // the arrival's, as `@solidjs/router`'s normalization of an empty
    // arrival is.
    const router = makeRouter(0, '/about')
    if (preloaded) await router.load()
    render(() => <RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByTestId('about')).toBeTruthy())
    await waitFor(() =>
      expect(router.stores.resolvedLocation.get()?.href).toBe(
        '/about?tab=info',
      ),
    )
    await sleep(0)
    const navs = attribution.history('navigation')
    expect(navs).toHaveLength(1)
    expect(navs[0]!.initial).toBe(true)
    expect(navs[0]!.name).toBe('/about')
    expect(navs[0]!.to).toBe('/about?tab=info')

    // The next navigation is dated from its own request, not the arrival's.
    const requested = performance.now()
    await router.navigate({ to: '/' })
    await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())
    await sleep(0)
    expect(navigations()).toHaveLength(1)
    expect(navigations()[0]!.name).toBe('/')
    expect(navigations()[0]!.from).toBe('/about?tab=info')
    expect(navigations()[0]!.at).toBeGreaterThanOrEqual(requested)
  },
)

test('a redirect while the first page loads is a navigation from the arrival', async () => {
  // As `@solidjs/router` records one: the arrival is declared and settled,
  // so the redirect is a navigation of its own, from it, not a hop.
  const router = makeRouter(0, '/dashboard')
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('login')).toBeTruthy())
  await sleep(0)

  const navs = attribution.history('navigation')
  expect(navs.map((nav) => [nav.initial, nav.name, nav.to, nav.from])).toEqual([
    [true, '/dashboard', '/dashboard', undefined],
    [undefined, '/login', '/login', '/dashboard'],
  ])
  // The guard redirected on its own: no interaction asked for it.
  expect(navs[1]!.interaction).toBeUndefined()
  expect(navs[1]!.redirects).toBeUndefined()
  expect(navs[1]!.outcome).toBe('committed')
})

test('the initial declaration is not a row in feedback().navigations', async () => {
  const router = makeRouter(0)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())
  expect(attribution.history('navigation').at(-1)!.initial).toBe(true)
  await router.navigate({ to: '/users/$id', params: { id: '1' } })
  await waitFor(() => expect(screen.getByTestId('user')).toBeTruthy())
  await sleep(0)
  const rows = feedback().navigations
  expect(rows.map((row) => row.name)).toEqual(['/users/$id'])
  expect(rows[0]!.navigations).toBe(1)
})

test('the match publish is declared as the navigation, dated from the history change', async () => {
  const router = makeRouter(30)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())
  expect(navigations()).toHaveLength(0)

  const requested = performance.now()
  await router.navigate({ to: '/users/$id', params: { id: '42' } })
  await waitFor(() => expect(screen.getByTestId('user')).toBeTruthy())
  await sleep(0)

  // One record for the navigation — the pending offer (a match with
  // `status: 'pending'`) is published undeclared.
  const navs = navigations()
  expect(navs).toHaveLength(1)
  const nav = navs[0]!
  expect(nav.name).toBe('/users/$id')
  expect(nav.to).toBe('/users/42')
  expect(nav.from).toBe('/')
  expect(nav.params).toEqual({ id: '42' })
  expect(nav.outcome).toBe('committed')
  // Not requested inside an interaction, and declared so.
  expect(nav.interaction).toBeUndefined()
  // `at` is the history change inside navigate(), before the loader ran:
  // the record spans the loader wait even though the publish came after it.
  expect(nav.at).toBeGreaterThanOrEqual(requested)
  expect(nav.at).toBeLessThan(requested + 30)
  expect(nav.settledMs!).toBeGreaterThanOrEqual(30)
})

test('`to` and `from` are the path, search and hash, as `@solidjs/router` gives them', async () => {
  const router = makeRouter(0)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())

  await router.navigate({
    to: '/users/$id',
    params: { id: '42' },
    search: { tab: 'posts' } as any,
    hash: 'bio',
  })
  await waitFor(() => expect(screen.getByTestId('user')).toBeTruthy())
  await router.navigate({ to: '/about' })
  await waitFor(() => expect(screen.getByTestId('about')).toBeTruthy())
  await sleep(0)

  expect(navigations().map((nav) => [nav.name, nav.to, nav.from])).toEqual([
    ['/users/$id', '/users/42?tab=posts#bio', '/'],
    ['/about', '/about?tab=info', '/users/42?tab=posts#bio'],
  ])
})

test('a navigation superseded before it published leaves one record for the destination that showed', async () => {
  const router = makeRouter(30)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())

  const requested = performance.now()
  void router.navigate({ to: '/users/$id', params: { id: '1' } })
  await sleep(5)
  await router.navigate({ to: '/users/$id', params: { id: '2' } })
  await waitFor(() =>
    expect(screen.getByTestId('user').textContent).toBe('user 2'),
  )
  await sleep(0)

  const navs = navigations()
  expect(navs).toHaveLength(1)
  expect(navs[0]!.to).toBe('/users/2')
  // Dated from the first request: that is when the user started waiting.
  expect(navs[0]!.at).toBeLessThan(requested + 5)
})

test('a navigation requested in an interaction joins it, though the publish runs after the loader', async () => {
  const router = makeRouter(30)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())

  let click: ReturnType<
    NonNullable<typeof OBSERVE>['attribution']['currentOrigin']
  >
  OBSERVE!.attribution.withInteraction({ type: 'click', target: 'a' }, () => {
    click = OBSERVE!.attribution.currentOrigin()
    void router.navigate({ to: '/users/$id', params: { id: '42' } })
  })
  await waitFor(() => expect(screen.getByTestId('user')).toBeTruthy())
  await sleep(0)

  const navs = navigations()
  expect(navs).toHaveLength(1)
  expect(click).toMatchObject({ kind: 'interaction', name: 'click' })
  expect(navs[0]!.interaction).toBe(click)
  expect(navs[0]!.settledMs!).toBeGreaterThanOrEqual(30)
})

test('a <Link> click is the interaction its navigation joins', async () => {
  const router = makeRouter(10)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())

  fireEvent.click(screen.getByTestId('link'))
  await waitFor(() => expect(screen.getByTestId('user')).toBeTruthy())
  await sleep(0)

  const navs = navigations()
  expect(navs).toHaveLength(1)
  expect(navs[0]!.name).toBe('/users/$id')
  expect(navs[0]!.interaction).toMatchObject({
    kind: 'interaction',
    name: 'click',
  })
})

test('a not-found is named by its pathname, not by the route above it', async () => {
  const router = makeRouter(0)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())

  // Nothing matches; and a path that runs past `/about`, which only matches
  // fuzzily (the not-found renders under it).
  await router.navigate({ to: '/nope/deeper' as any })
  await sleep(10)
  await router.navigate({ to: '/about/nope' as any })
  await sleep(10)

  const navs = navigations()
  expect(navs.map((nav) => [nav.name, nav.params])).toEqual([
    ['/nope/deeper', undefined],
    ['/about/nope', undefined],
  ])
})

test('params are the strings the path bound, before `params.parse`', async () => {
  const router = makeRouter(0)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())

  await router.navigate({ to: '/posts/$postId', params: { postId: 5 } })
  await waitFor(() => expect(screen.getByTestId('post')).toBeTruthy())
  await sleep(0)

  expect(navigations()[0]!.name).toBe('/posts/$postId')
  expect(navigations()[0]!.params).toEqual({ postId: '5' })
})
