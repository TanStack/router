import { Link, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/params-ps/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <h3 class="pb-2">Named path params</h3>
      <ul class="grid mb-2">
        <li>
          <Link
            data-testid="l-to-named-foo"
            to="/params-ps/named/$foo"
            params={{ foo: 'foo' }}
          >
            /params-ps/named/$foo
          </Link>
        </li>
      </ul>
      <hr />
      <h3 class="pb-2">Non-nested path params</h3>
      <ul class="grid mb-2">
        <li>
          <Link data-testid="l-to-non-nested" to="/params-ps/non-nested">
            Non-nested
          </Link>
        </li>
      </ul>
    </div>
  )
}
