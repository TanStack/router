import { Link, Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/params-ps/non-nested')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <h3 className="pb-2">Non-nested path params</h3>
      <h3>/params-ps/non-nested/route</h3>
      <hr />
      <ul className="grid mt-2 mb-2">
        <li>
          <Link
            from={Route.fullPath}
            data-testid="l-to-non-nested-foo-bar"
            to="./$foo/$bar"
            params={{ foo: 'foo', bar: 'bar' }}
            className="mr-5"
          >
            /params-ps/non-nested/foo/bar
          </Link>
          <Link
            from={Route.fullPath}
            data-testid="l-to-non-nested-foo2-bar2"
            to="./$foo/$bar"
            params={{ foo: 'foo2', bar: 'bar2' }}
          >
            /params-ps/non-nested/foo2/bar2
          </Link>
        </li>
      </ul>
      <Outlet />
    </div>
  )
}
