import { Link, Outlet, createFileRoute } from '@tanstack/solid-router'
import { createEffect, createSignal } from 'solid-js'

export const Route = createFileRoute('/params-ps/named/$foo')({
  component: RouteComponent,
})

function RouteComponent() {
  const [renderCount, setRenderCountCount] = createSignal(0)
  const params = Route.useParams()

  createEffect(() => {
    params().foo

    setRenderCountCount((prev) => prev + 1)
  })

  return (
    <div>
      <h3>ParamsNamedFoo</h3>
      <div>
        RenderCount: <span data-testid="foo-render-count">{renderCount()}</span>
      </div>
      <div data-testid="params-output">{JSON.stringify(params())}</div>
      <Link from={Route.fullPath} to="." data-testid="params-foo-links-index">
        Index
      </Link>
      <Link
        from={Route.fullPath}
        to="./$bar"
        params={{ bar: '1' }}
        data-testid="params-foo-links-bar1"
      >
        Bar1
      </Link>
      <Link
        from={Route.fullPath}
        to="./$bar"
        params={{ bar: '2' }}
        data-testid="params-foo-links-bar2"
      >
        Bar2
      </Link>
      <Outlet />
    </div>
  )
}
