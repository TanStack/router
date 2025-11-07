import { createFileRoute } from '@tanstack/preact-router'
import { Outlet } from '@tanstack/preact-router'

export const Route = createFileRoute('/_pathlessLayout')({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div className="p-2">
      <div className="border-b">I'm a pathless layout</div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
