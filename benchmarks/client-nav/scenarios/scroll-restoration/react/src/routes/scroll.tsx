import { Link, Outlet, createRoute } from '@tanstack/react-router'
import { SCROLL_CONTAINER_IDS, scrollCycles } from '../../../shared.ts'
import { RestoredMarker, fillerRows } from '../scroll-runtime'
import { rootRoute } from './__root'

export const scrollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scroll',
  component: ScrollShell,
})

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
