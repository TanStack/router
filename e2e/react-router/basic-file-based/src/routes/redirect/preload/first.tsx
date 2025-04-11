import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div data-testid="first">
      <Link
        from={Route.fullPath}
        to="../second"
        activeProps={{
          className: 'font-bold',
        }}
        preload="intent"
        data-testid={'link'}
      >
        go to second
      </Link>
    </div>
  )
}
