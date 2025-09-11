import { Link, Outlet, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/params-ps/non-nested')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <h3 class="pb-2">Non-nested path params</h3>
      <ul class="grid mb-2">
        <li>
          <Link
            from={Route.fullPath}
            data-testid="l-to-non-nested-foo-bar"
            to="./$foo/$bar"
            params={{ foo: 'foo', bar: 'bar' }}
          >
            /params-ps/non-nested/$foo/$bar
          </Link>
        </li>
      </ul>
      <Outlet />
    </div>
  )
}
