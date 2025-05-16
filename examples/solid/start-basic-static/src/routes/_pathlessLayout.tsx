import { Outlet } from '@tanstack/solid-router'

export const Route = createFileRoute({
  component: PathlessLayoutComponent,
})

function PathlessLayoutComponent() {
  return (
    <div class="p-2">
      <div class="border-b">I'm a pathless layout</div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
