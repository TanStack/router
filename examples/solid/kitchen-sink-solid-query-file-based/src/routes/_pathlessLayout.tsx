import { Outlet } from '@tanstack/solid-router'

export const Route = createFileRoute({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div>
      <div>Layout</div>
      <hr />
      <Outlet />
    </div>
  )
}
