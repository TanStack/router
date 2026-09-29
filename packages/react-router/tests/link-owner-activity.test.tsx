import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function fixture(Home: React.ComponentType, redirectBack = false) {
  const started = createControlledPromise<void>()
  const gate = createControlledPromise<void>()
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      value: typeof search.value === 'string' ? search.value : '',
    }),
    component: () => (
      <>
        <Link to="/away" activeOptions={{ includeSearch: false }}>
          Header away
        </Link>
        <Outlet />
      </>
    ),
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: Home,
  })
  const away = createRoute({
    getParentRoute: () => root,
    path: '/away',
    loader: async () => {
      started.resolve()
      await gate
      if (redirectBack) {
        throw redirect({ to: '/home', search: { value: 'after' } })
      }
    },
    component: () => <p>Away page</p>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    component: () => <p>Target page</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, away, target]),
    history: createMemoryHistory({ initialEntries: ['/home?value=before'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  return { router, started, gate }
}

async function ready(router: ReturnType<typeof fixture>['router']) {
  await screen.findByRole('link', { name: 'Header away' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
}

test('retained activity advances while departing activity waits and href stays live', async () => {
  const { router, started, gate } = fixture(() => (
    <>
      <Link to="/home" activeOptions={{ includeSearch: false }}>
        Departing home
      </Link>
      <Link to="/target" search={true}>
        Inherited search
      </Link>
    </>
  ))
  await ready(router)
  const outgoing = screen.getByRole('link', { name: 'Departing home' })
  const inherited = screen.getByRole('link', { name: 'Inherited search' })
  expect(outgoing).toHaveAttribute('aria-current', 'page')
  expect(inherited.getAttribute('href')).toContain('value=before')
  let navigation!: Promise<void>
  try {
    await act(async () => {
      navigation = router.navigate({ to: '/away', search: { value: 'after' } })
      await started
    })
    expect(outgoing).toBeInTheDocument()
    expect(outgoing).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Header away' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(inherited.getAttribute('href')).toContain('value=after')
  } finally {
    await act(async () => {
      gate.resolve()
      await navigation
    })
  }
  await screen.findByText('Away page')
  expect(outgoing).not.toBeInTheDocument()
})

test('a changed destination uses a live active baseline while its owner is held', async () => {
  let retarget!: () => void
  const { router, started, gate } = fixture(function Home() {
    const [to, setTo] = React.useState('/target')
    retarget = () => setTo('/away')
    return (
      <Link to={to} activeOptions={{ includeSearch: false }}>
        Retargeted link
      </Link>
    )
  })
  await ready(router)
  let navigation!: Promise<void>
  try {
    await act(async () => {
      navigation = router.navigate({ to: '/away' })
      await started
    })
    const link = screen.getByRole('link', { name: 'Retargeted link' })
    expect(link).not.toHaveAttribute('aria-current')
    act(() => retarget())
    expect(link.getAttribute('href')).toContain('/away')
    expect(link).toHaveAttribute('aria-current', 'page')
  } finally {
    await act(async () => {
      gate.resolve()
      await navigation
    })
  }
})

test('redirecting back to a departing owner repairs its active state', async () => {
  const { router, started, gate } = fixture(
    () => (
      <Link
        to="/home"
        search={{ value: 'after' }}
        activeOptions={{ exact: true }}
      >
        After link
      </Link>
    ),
    true,
  )
  await ready(router)
  const link = screen.getByRole('link', { name: 'After link' })
  expect(link).not.toHaveAttribute('aria-current')
  let navigation!: Promise<void>
  try {
    await act(async () => {
      navigation = router.navigate({ to: '/away', search: { value: 'after' } })
      await started
    })
    expect(link).not.toHaveAttribute('aria-current')
  } finally {
    await act(async () => {
      gate.resolve()
      await navigation
    })
  }
  await waitFor(() => {
    expect(screen.getByRole('link', { name: 'After link' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
  expect(router.state.location.pathname).toBe('/home')
})

test('superseding navigation repairs an owner without waiting for the old loader', async () => {
  const { router, started, gate } = fixture(() => (
    <Link to="/home" search={{ value: 'after' }} activeOptions={{ exact: true }}>
      After link
    </Link>
  ))
  await ready(router)
  let first!: Promise<void>
  try {
    await act(async () => {
      first = router.navigate({ to: '/away' })
      await started
    })
    await act(async () => {
      await router.navigate({ to: '/home', search: { value: 'after' } })
    })
    expect(screen.getByRole('link', { name: 'After link' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  } finally {
    await act(async () => {
      gate.resolve()
      await first
    })
  }
  expect(router.state.location.pathname).toBe('/home')
})

test('changing only href updates both the anchor and subsequent navigation', async () => {
  let retarget!: () => void
  const { router } = fixture(function Home() {
    const [href, setHref] = React.useState('/home')
    retarget = () => setHref('/target')
    return <Link href={href}>Href link</Link>
  })
  await ready(router)
  act(() => retarget())
  const link = screen.getByRole('link', { name: 'Href link' })
  expect(link.getAttribute('href')).toContain('/target')
  fireEvent.click(link)
  await screen.findByText('Target page')
  expect(router.state.location.pathname).toBe('/target')
})

test('changing only reloadDocument reaches the next navigation call', async () => {
  let enableReload!: () => void
  const { router } = fixture(function Home() {
    const [reloadDocument, setReloadDocument] = React.useState(false)
    enableReload = () => setReloadDocument(true)
    return (
      <Link to="/target" reloadDocument={reloadDocument}>
        Reload link
      </Link>
    )
  })
  await ready(router)
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(undefined)
  act(() => enableReload())
  fireEvent.click(screen.getByRole('link', { name: 'Reload link' }))
  expect(navigate).toHaveBeenCalledWith(
    expect.objectContaining({ to: '/target', reloadDocument: true }),
  )
})
