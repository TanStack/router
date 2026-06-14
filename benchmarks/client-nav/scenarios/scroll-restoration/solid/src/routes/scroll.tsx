import { For } from 'solid-js'
import { Link, Outlet, createRoute } from '@tanstack/solid-router'
import {
  SCROLL_CONTAINER_IDS,
  SCROLL_ROUTE_PATHS,
  scrollCycles,
  scrollSidebarRows,
} from '../../../shared.ts'
import { RestoredMarker } from '../scroll-runtime'
import { rootRoute } from './__root'

export const scrollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SCROLL_ROUTE_PATHS.root,
  component: ScrollShell,
})

function ScrollShell() {
  const firstCycle = scrollCycles[0]!

  return (
    <main data-scroll-page="scroll">
      <nav data-scroll-nav="root">
        <Link
          data-testid="scroll-nav-list"
          to={SCROLL_ROUTE_PATHS.list}
          params={{ listId: firstCycle.listId }}
        >
          List A
        </Link>
        <Link
          data-testid="scroll-nav-detail-hash"
          to={SCROLL_ROUTE_PATHS.detail}
          params={{ listId: firstCycle.listId, itemId: firstCycle.detailAId }}
          hash={firstCycle.hashId}
        >
          Detail A Hash
        </Link>
        <Link data-testid="scroll-nav-static" to={SCROLL_ROUTE_PATHS.static}>
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
          <For each={scrollSidebarRows}>
            {(row) => <p>{`Sidebar row ${row}`}</p>}
          </For>
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
