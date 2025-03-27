import { Trans } from '@lingui/react/macro'
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathlessLayout')({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div className="p-2">
      <div className="border-b"><Trans>I'm a layout</Trans></div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
