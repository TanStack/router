import {
  Link,
  Outlet,
  RouterProvider,
  createControlledPromise,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import { deepPath, depth } from '../cases'
import type { AnyRoute, RouterHistory } from '@tanstack/react-router'
import type { OutletCase } from '../cases'

export const serverEnvironment: boolean | undefined = isServer

function Controls({
  pending = false,
  preparePending,
}: {
  pending?: boolean
  preparePending?: () => void
}) {
  const leafPath = pending ? `${deepPath}/waiting` : deepPath
  return (
    <>
      <nav>
        <Link
          data-testid="leaf-first"
          to={`${leafPath}/first` as any}
          onClick={preparePending}
          replace
        >
          First leaf
        </Link>
        <Link
          data-testid="leaf-second"
          to={`${leafPath}/second` as any}
          onClick={preparePending}
          replace
        >
          Second leaf
        </Link>
        <Link data-testid="empty" to={`${deepPath}/empty` as any} replace>
          Empty terminal
        </Link>
        <Link data-testid="home" to="/" replace>
          Home
        </Link>
      </nav>
      <Outlet />
    </>
  )
}

function Leaf() {
  const params = useParams({ strict: false })
  return <span data-testid="leaf-state">{params.id}</span>
}

function UnexpectedFallback() {
  return <span data-testid="unexpected-fallback">Unexpected fallback</span>
}

function ExplicitOutlet() {
  return <Outlet />
}

interface Fiber {
  child: Fiber | null
  sibling: Fiber | null
}

// Read only the committed tree, outside measurement, to verify the mechanism
// independently of navigation timing. This is deliberately benchmark-only.
function countFibers(fiber: Fiber | null): number {
  let count = 0
  for (let current = fiber; current; current = current.sibling) {
    count += 1 + countFibers(current.child)
  }
  return count
}

export function mountTestApp(
  container: HTMLElement,
  history: RouterHistory,
  workload: OutletCase,
  pending = false,
) {
  let pendingCommits = 0
  let pendingGate = createControlledPromise<void>()
  function preparePending() {
    pendingGate = createControlledPromise<void>()
  }
  function Pending() {
    useEffect(() => {
      pendingCommits += 1
      pendingGate.resolve()
    }, [])
    return <span data-testid="pending-state">Pending</span>
  }
  const rootRoute = createRootRoute({
    component: pending
      ? () => <Controls pending preparePending={preparePending} />
      : Controls,
  })
  const chain: Array<AnyRoute> = []
  let parent: AnyRoute = rootRoute
  for (let index = 0; index < depth; index++) {
    const parentRoute = parent
    const route = createRoute({
      getParentRoute: () => parentRoute,
      path: `level-${index}`,
      component:
        workload.mode === 'explicit' ||
        (workload.mode === 'mixed' && index % 2 === 0)
          ? ExplicitOutlet
          : undefined,
    })
    chain.push(route)
    parent = route
  }
  const waiting = pending
    ? createRoute({
        getParentRoute: () => parent,
        path: 'waiting',
        loader: {
          staleReloadMode: 'blocking',
          handler: () => pendingGate,
        },
        pendingComponent: Pending,
        pendingMs: 0,
        pendingMinMs: 0,
      })
    : undefined
  const leafParent = waiting ?? parent
  const leaf = createRoute({
    getParentRoute: () => leafParent,
    path: '$id',
    component: Leaf,
  })
  const empty = createRoute({
    getParentRoute: () => parent,
    path: 'empty',
  })
  if (waiting) {
    waiting.addChildren([leaf])
    parent.addChildren([waiting, empty])
  } else {
    parent.addChildren([leaf, empty])
  }
  for (let index = chain.length - 2; index >= 0; index--) {
    chain[index]!.addChildren([chain[index + 1]!])
  }
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <span data-testid="home-state">Home</span>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([chain[0]!, home]),
    history,
    scrollRestoration: true,
    getScrollRestorationKey: (location) => location.pathname,
    defaultPendingMs: pending ? 0 : undefined,
    defaultPendingMinMs: pending ? 0 : undefined,
    defaultPendingComponent: pending
      ? Pending
      : workload.boundaries
        ? UnexpectedFallback
        : undefined,
    defaultErrorComponent: workload.boundaries ? UnexpectedFallback : undefined,
  })
  const root = createRoot(container)
  root.render(<RouterProvider router={router} />)

  return {
    router,
    unmount: () => {
      pendingGate.resolve()
      root.unmount()
    },
    readPendingCommits: () => pendingCommits,
    readFiberCount: () =>
      countFibers(
        (root as unknown as { _internalRoot: { current: Fiber } })._internalRoot
          .current,
      ),
  }
}
