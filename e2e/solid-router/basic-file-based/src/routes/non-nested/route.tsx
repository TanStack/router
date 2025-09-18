import { Link, Outlet, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/non-nested')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <h3 class="pb-2" data-testid="non-nested-path-heading">
        Non-nested paths
      </h3>
      <ul class="grid mb-2">
        <li>
          <Link
            from={Route.fullPath}
            data-testid="l-to-non-nested-bazid"
            to="./baz/$bazid"
            params={{ bazid: '123' }}
          >
            /non-nested/baz/123
          </Link>
        </li>
        <li>
          <Link
            from={Route.fullPath}
            data-testid="l-to-non-nested-bazid-edit"
            to="./baz/$bazid/edit"
            params={{ bazid: '456' }}
          >
            /non-nested/baz/456/edit
          </Link>
        </li>
      </ul>
      <Outlet />
    </div>
  )
}
