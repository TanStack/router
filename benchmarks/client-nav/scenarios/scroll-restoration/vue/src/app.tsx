import * as Vue from 'vue'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useElementScrollRestoration,
} from '@tanstack/vue-router'
import {
  SCROLL_CONTAINER_IDS,
  SCROLL_START_PATH,
  getHashAnchorId,
  getScrollRestorationKey,
  normalizeScrollSegment,
  runScrollRenderComputation,
  scrollCycles,
} from '../../shared.ts'

type ScrollContainerKey = keyof typeof SCROLL_CONTAINER_IDS

const fillerRows = Array.from({ length: 18 }, (_, index) => index)

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const RestoredMarker = Vue.defineComponent({
  props: {
    id: {
      type: String as Vue.PropType<ScrollContainerKey>,
      required: true,
    },
  },
  setup(props) {
    const restorationId = SCROLL_CONTAINER_IDS[props.id]
    const entry = useElementScrollRestoration({
      id: restorationId,
      getKey: getScrollRestorationKey,
    })

    return () => {
      void runScrollRenderComputation(entry?.scrollY ?? 0)
      return (
        <span
          data-scroll-restored={restorationId}
          data-scroll-restored-y={entry?.scrollY ?? 0}
        />
      )
    }
  },
})

const ScrollShell = Vue.defineComponent({
  setup() {
    const firstCycle = scrollCycles[0]!

    return () => (
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
  },
})

const ListPage = Vue.defineComponent({
  setup() {
    const params = listRoute.useParams()

    return () => {
      const listId = params.value.listId
      const checksum = runScrollRenderComputation(listId.length)

      return (
        <section data-scroll-page="list" data-list-id={listId}>
          <div
            data-scroll-restoration-id={SCROLL_CONTAINER_IDS.list}
            data-scroll-region="list"
            data-list-checksum={checksum}
          >
            <RestoredMarker id="list" />
            {fillerRows.map((row) => (
              <article
                key={`list-${listId}-${row}`}
              >{`List ${listId} row ${row}`}</article>
            ))}
            <Outlet />
          </div>
        </section>
      )
    }
  },
})

const DetailPage = Vue.defineComponent({
  setup() {
    const params = detailRoute.useParams()

    return () => {
      const listId = params.value.listId
      const itemId = params.value.itemId
      const checksum = runScrollRenderComputation(itemId.length * 17)

      return (
        <section
          data-scroll-page="detail"
          data-list-id={listId}
          data-item-id={itemId}
        >
          <div
            data-scroll-restoration-id={SCROLL_CONTAINER_IDS.detail}
            data-scroll-region="detail"
            data-detail-checksum={checksum}
          >
            <RestoredMarker id="detail" />
            <h2 id={getHashAnchorId(itemId)}>{`Detail ${itemId}`}</h2>
            {fillerRows.map((row) => (
              <p key={`detail-${itemId}-${row}`}>{`Detail row ${row}`}</p>
            ))}
          </div>
        </section>
      )
    }
  },
})

const StaticPage = Vue.defineComponent({
  setup() {
    return () => (
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
  },
})

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
  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
  })
  let didUnmount = false

  app.mount(container)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      app.unmount()
    },
  }
}
