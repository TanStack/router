import { Outlet } from '@tanstack/solid-router'

export const Route = createFileRoute({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div class="p-2">
      <div class="border-b">I'm a layout</div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
