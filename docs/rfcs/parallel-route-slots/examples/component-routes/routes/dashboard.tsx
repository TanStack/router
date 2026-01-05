// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  slots: {
    header: true,
    activity: true,
    metrics: true,
    notifications: true,
    adminPanel: true,
    quickActions: true,
    userCard: true,
  },
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="dashboard">
      {/* Explicitly placed header slot */}
      <header>
        <Route.SlotOutlet name="header" />
      </header>

      <div className="dashboard-layout">
        {/* Use Route.Slots to dynamically render widgets */}
        <Route.Slots>
          {(slots) => {
            // Filter and group slots by their staticData.area
            const mainSlots = slots
              .filter((s) => s.staticData?.area === 'main')
              .sort(
                (a, b) =>
                  (a.staticData?.priority ?? 99) -
                  (b.staticData?.priority ?? 99),
              )

            const sidebarSlots = slots
              .filter((s) => s.staticData?.area === 'sidebar')
              .sort(
                (a, b) =>
                  (a.staticData?.priority ?? 99) -
                  (b.staticData?.priority ?? 99),
              )

            return (
              <>
                {/* Main content area with widget grid */}
                <main className="dashboard-main">
                  {/* Regular child routes */}
                  <Outlet />

                  {/* Widget grid */}
                  <div className="widget-grid">
                    {mainSlots.map((slot) => (
                      <div key={slot.name} className="widget-container">
                        <div className="widget-header">
                          <h3>{slot.staticData?.title || slot.name}</h3>
                          {slot.staticData?.collapsible && (
                            <button>Toggle</button>
                          )}
                        </div>
                        <div className="widget-content">
                          <slot.Outlet />
                        </div>
                      </div>
                    ))}
                  </div>
                </main>

                {/* Sidebar with additional widgets */}
                <aside className="dashboard-sidebar">
                  {sidebarSlots.map((slot) => (
                    <div key={slot.name} className="sidebar-widget">
                      <slot.Outlet />
                    </div>
                  ))}
                </aside>
              </>
            )
          }}
        </Route.Slots>
      </div>
    </div>
  )
}
