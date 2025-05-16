import { Outlet } from '@tanstack/react-router'

export const Route = createFileRoute({
  component: PathlessLayoutComponent,
})

function PathlessLayoutComponent() {
  return (
    <div className="p-2">
      <div className="border-b">I'm a pathless layout</div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
