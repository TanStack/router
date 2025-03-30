

export const Route = createFileRoute({
  component: ProfileComponent,
})

function ProfileComponent() {
  const routeContext = Route.useRouteContext()

  return (
    <div class="p-2 space-y-2">
      <div>
        Username:<strong>{routeContext().username}</strong>
      </div>
    </div>
  )
}
