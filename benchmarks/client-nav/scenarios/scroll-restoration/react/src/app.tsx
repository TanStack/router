import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useElementScrollRestoration,
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import {
  SCROLL_CONTAINER_IDS,
  SCROLL_START_PATH,
  getHashAnchorId,
  getScrollRestorationKey,
  normalizeScrollSegment,
  runScrollRenderComputation,
  scrollCycles,
} from '../../shared.ts'

const fillerRows = Array.from({ length: 18 }, (_, index) => index)

const rootRoute = createRootRoute({
  component: Root,
})

const scrollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scroll',
  component: ScrollShell,
})

const listRoute = createRoute({
  getParentRoute: () => scrollRoute,
  path: 'list/$listId',
  params: {
    parse: (params) => ({
      listId: normalizeScrollSegment(params.listId, 'missing-list'),
    }),
    stringify: (params) => ({
      listId: normalizeScrollSegment(params.listId, 'missing-list'),
    }),
  },
  component: ListPage,
})

const detailRoute = createRoute({
  getParentRoute: () => listRoute,
  path: 'detail/$itemId',
  params: {
    parse: (params) => ({
      itemId: normalizeScrollSegment(params.itemId, 'missing-item'),
    }),
    stringify: (params) => ({
      itemId: normalizeScrollSegment(params.itemId, 'missing-item'),
    }),
  },
  component: DetailPage,
})

const staticRoute = createRoute({
  getParentRoute: () => scrollRoute,
  path: 'static',
  component: StaticPage,
})

function Root() {
  return <Outlet />
}

function RestoredMarker(props: { id: keyof typeof SCROLL_CONTAINER_IDS }) {
  const restorationId = SCROLL_CONTAINER_IDS[props.id]
  const entry = useElementScrollRestoration({
    id: restorationId,
    getKey: getScrollRestorationKey,
  })

  void runScrollRenderComputation(entry?.scrollY ?? 0)
  return (
    <span
      data-scroll-restored={restorationId}
      data-scroll-restored-y={entry?.scrollY ?? 0}
    />
  )
}

function ScrollShell() {
  const firstCycle = scrollCycles[0]!

  return (
    <main data-scroll-page="scroll">
      <nav data-scroll-nav="root">
        <Link
          data-testid="scroll-nav-list"
          to="/scroll/list/$listId"
          params={{ listId: firstCycle.listId }}
        >
          List A
        </Link>
        <Link
          data-testid="scroll-nav-detail-hash"
          to="/scroll/list/$listId/detail/$itemId"
          params={{ listId: firstCycle.listId, itemId: firstCycle.detailAId }}
          hash={firstCycle.hashId}
        >
          Detail A Hash
        </Link>
        <Link data-testid="scroll-nav-static" to="/scroll/static">
          Static
        </Link>
      </nav>
      <section
        data-scroll-restoration-id={SCROLL_CONTAINER_IDS.root}
        data-scroll-region="root"
      >
        <RestoredMarker id="root" />
        <aside
          data-scroll-restoration-id={SCROLL_CONTAINER_IDS.sidebar}
          data-scroll-region="sidebar"
        >
          {fillerRows.slice(0, 6).map((row) => (
            <p key={`sidebar-${row}`}>{`Sidebar row ${row}`}</p>
          ))}
        </aside>
        <div
          data-scroll-restoration-id={SCROLL_CONTAINER_IDS.resetPanel}
          data-scroll-region="reset-panel"
        >
          <RestoredMarker id="resetPanel" />
          <Outlet />
        </div>
      </section>
    </main>
  )
}

function ListPage() {
  const params = listRoute.useParams()
  const checksum = runScrollRenderComputation(params.listId.length)

  return (
    <section data-scroll-page="list" data-list-id={params.listId}>
      <div
        data-scroll-restoration-id={SCROLL_CONTAINER_IDS.list}
        data-scroll-region="list"
        data-list-checksum={checksum}
      >
        <RestoredMarker id="list" />
        {fillerRows.map((row) => (
          <article key={`list-${params.listId}-${row}`}>
            {`List ${params.listId} row ${row}`}
          </article>
        ))}
        <Outlet />
      </div>
    </section>
  )
}

function DetailPage() {
  const params = detailRoute.useParams()
  const hashId = getHashAnchorId(params.itemId)
  const checksum = runScrollRenderComputation(params.itemId.length * 17)

  return (
    <section
      data-scroll-page="detail"
      data-list-id={params.listId}
      data-item-id={params.itemId}
    >
      <div
        data-scroll-restoration-id={SCROLL_CONTAINER_IDS.detail}
        data-scroll-region="detail"
        data-detail-checksum={checksum}
      >
        <RestoredMarker id="detail" />
        <h2 id={hashId}>{`Detail ${params.itemId}`}</h2>
        {fillerRows.map((row) => (
          <p key={`detail-${params.itemId}-${row}`}>{`Detail row ${row}`}</p>
        ))}
      </div>
    </section>
  )
}

function StaticPage() {
  return (
    <section data-scroll-page="static">
      <div
        data-scroll-restoration-id={SCROLL_CONTAINER_IDS.static}
        data-scroll-region="static"
      >
        <RestoredMarker id="static" />
        {fillerRows.map((row) => (
          <p key={`static-${row}`}>{`Static row ${row}`}</p>
        ))}
      </div>
    </section>
  )
}

const routeTree = rootRoute.addChildren([
  scrollRoute.addChildren([listRoute.addChildren([detailRoute]), staticRoute]),
])

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [SCROLL_START_PATH],
    }),
    scrollRestoration: true,
    getScrollRestorationKey,
    scrollToTopSelectors: [
      `[data-scroll-restoration-id="${SCROLL_CONTAINER_IDS.resetPanel}"]`,
      `[data-scroll-restoration-id="${SCROLL_CONTAINER_IDS.list}"]`,
      () =>
        document.querySelector(
          `[data-scroll-restoration-id="${SCROLL_CONTAINER_IDS.detail}"]`,
        ),
    ],
    routeTree,
  })
  const reactRoot = createRoot(container)
  let didUnmount = false

  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      reactRoot.unmount()
    },
  }
}
