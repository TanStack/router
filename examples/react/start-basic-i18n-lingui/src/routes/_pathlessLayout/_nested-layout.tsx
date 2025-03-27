import { Trans } from '@lingui/react/macro'
import { Link, Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathlessLayout/_nested-layout')({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div>
      <div><Trans>I'm a nested layout</Trans></div>
      <div className="flex gap-2 border-b">
        <Link
          to="/route-a"
          activeProps={{
            className: 'font-bold',
          }}
        >
          <Trans>Go to route A</Trans>
        </Link>
        <Link
          to="/route-b"
          activeProps={{
            className: 'font-bold',
          }}
        >
          <Trans>Go to route B</Trans>
        </Link>
      </div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
