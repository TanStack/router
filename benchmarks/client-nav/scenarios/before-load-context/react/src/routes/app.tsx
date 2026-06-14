import { Outlet, createFileRoute } from '@tanstack/react-router'
import { deriveTenantContext, runContextComputation } from '../../../shared'
import { consumeSelectedValue, middleSubscribers } from '../runtime'

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => deriveTenantContext(context),
  component: AppLayout,
})

function AppContextSubscriber(props: { selector: number }) {
  const value = Route.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.tenantChecksum + props.selector,
        context.tenantId,
        10,
      ),
  })

  consumeSelectedValue(value, 'app-context-subscriber')
  return null
}

function AppLayout() {
  return (
    <>
      {middleSubscribers.map((selector) => (
        <AppContextSubscriber key={`app-${selector}`} selector={selector} />
      ))}
      <Outlet />
    </>
  )
}
