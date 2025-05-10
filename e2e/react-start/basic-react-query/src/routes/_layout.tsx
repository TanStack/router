import { Outlet } from '@tanstack/react-router'

export const Route = createFileRoute({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div className="p-2">
      <div>I'm a layout</div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
