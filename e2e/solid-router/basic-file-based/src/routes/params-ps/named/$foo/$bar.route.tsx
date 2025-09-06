import {
  Link,
  Outlet,
  createFileRoute,
  useParams,
} from '@tanstack/solid-router'
import { createEffect, createSignal } from 'solid-js'

export const Route = createFileRoute('/params-ps/named/$foo/$bar')({
  component: RouteComponent,
})

function RouteComponent() {
  const [renderBarCount, setBarRenderCountCount] = createSignal(0)
  const [renderBazCount, setBazRenderCountCount] = createSignal(0)

  const params = useParams({
    strict: false,
  })

  createEffect(() => {
    params().bar
    setBarRenderCountCount((prev) => prev + 1)
  })

  createEffect(() => {
    params().baz
    setBazRenderCountCount((prev) => prev + 1)
  })

  return (
    <div>
      Hello "/params-ps/named/$foo/$bar"!
      <div>
        Bar Render Count:{' '}
        <span data-testid="foo-bar-render-count">{renderBarCount()}</span>
      </div>
      <div>
        Bar: <span data-testid="foo-bar-value">{params().bar}</span>
      </div>
      <div>
        Baz in Bar Render Count:{' '}
        <span data-testid="foo-baz-in-bar-render-count">
          {renderBazCount()}
        </span>
      </div>
      <div>
        Baz in Bar:{' '}
        <span data-testid="foo-baz-in-bar-value">
          {params().baz ?? 'no param'}
        </span>
      </div>
      <Link
        data-testid="params-foo-bar-links-baz"
        from={Route.fullPath}
        to="./$baz"
        params={{ baz: `${params().bar}_10` }}
      >
        To Baz
      </Link>
      <Outlet />
    </div>
  )
}
