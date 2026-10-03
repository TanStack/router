import { createRoot } from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

let release!: () => void
let loaderPending = false
const gate = new Promise<void>((resolve) => {
  release = resolve
})
function RetainedLink({ name }: { name: string }) {
  return (
    <Link
      data-retained={name}
      from="/items/$id"
      to="/items/$id"
      params={true}
      search={true}
      hash="nav-1"
      activeOptions={{ exact: true, includeHash: true }}
    >
      {name}
    </Link>
  )
}
const rootRoute = createRootRoute({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 0),
  }),
  component: () => (
    <>
      <Link
        id="next"
        to="/items/$id"
        params={{ id: '0' }}
        search={{ page: 1 }}
        hash="nav-1"
      >
        Next
      </Link>
      <RetainedLink name="ancestor" />
      <Outlet />
    </>
  ),
})
const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'items/$id',
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ deps }) => {
    if (deps.page === 1) {
      loaderPending = true
      await gate
      loaderPending = false
    }
    return deps.page
  },
  component: () => (
    <>
      <div id="content">{itemsRoute.useLoaderData()}</div>
      <RetainedLink name="leaf" />
    </>
  ),
})
const router = createRouter({
  routeTree: rootRoute.addChildren([itemsRoute]),
  history: createMemoryHistory({ initialEntries: ['/items/0?page=0#nav-0'] }),
  defaultPendingMs: 10_000,
  defaultPreload: false,
  scrollRestoration: false,
})
function rendered() {
  return new Promise<void>((resolve) => {
    const stop = router.subscribe('onRendered', () => {
      stop()
      resolve()
    })
  })
}
const ready = rendered()
createRoot(document.getElementById('app')!).render(
  <RouterProvider router={router} />,
)

async function check() {
  await ready
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('[data-retained]'),
  )
  function assertLinks(href: string, active: boolean) {
    const current = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('[data-retained]'),
    )
    if (current.length !== 2) {
      throw new Error('Expected ancestor and leaf Links')
    }
    for (const [index, link] of current.entries()) {
      if (
        link !== anchors[index] ||
        link.dataset.retained !== (index === 0 ? 'ancestor' : 'leaf') ||
        link.getAttribute('href') !== href ||
        (link.getAttribute('data-status') === 'active') !== active
      ) {
        throw new Error(
          `Incorrect retained ${link.dataset.retained} Link: ${link.outerHTML}`,
        )
      }
    }
  }
  assertLinks('/items/0?page=0#nav-1', false)
  let gateClosed = true
  let marked = false
  const observer = new MutationObserver(() => {
    if (
      gateClosed &&
      !marked &&
      anchors.every(
        (link) =>
          link.getAttribute('href') === '/items/0?page=1#nav-1' &&
          link.getAttribute('data-status') === 'active',
      )
    ) {
      marked = true
      performance.mark('pending-links-current')
    }
  })
  observer.observe(document.getElementById('app')!, {
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'data-status'],
  })
  const completed = rendered()
  // The timer checks pending behavior; the observer's trace mark establishes
  // whether both DOM updates completed before the click task actually ended.
  const opportunity = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      try {
        if (
          !loaderPending ||
          document.getElementById('content')?.textContent !== '0'
        ) {
          throw new Error('Destination must still be waiting for its loader')
        }
        if (router.state.location.href !== '/items/0?page=1#nav-1') {
          throw new Error(
            'Pending navigation did not reach the latest location',
          )
        }
        assertLinks('/items/0?page=1#nav-1', true)
        resolve()
      } catch (error) {
        reject(error)
      }
    }, 0)
  })
  performance.mark('pending-click-start')
  document
    .getElementById('next')!
    .dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    )
  try {
    await opportunity
  } finally {
    observer.disconnect()
    gateClosed = false
    release()
    await completed
  }
  assertLinks('/items/0?page=1#nav-1', true)
  if (document.getElementById('content')?.textContent !== '1') {
    throw new Error('Destination loader result was not rendered')
  }
  return {
    ancestor: 'updated before loader release',
    leaf: 'updated before loader release',
  }
}

Object.assign(window, { linkPresentationPending: { ready, check } })
