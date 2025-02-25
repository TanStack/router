import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/redirect/component/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div data-testid="first">
      <Link
        from={Route.fullPath}
        to="./first"
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
