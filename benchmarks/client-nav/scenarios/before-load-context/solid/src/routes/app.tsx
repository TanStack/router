import { For } from 'solid-js'
import { Outlet, createFileRoute } from '@tanstack/solid-router'
import {
  consumeSelectedValue,
  deriveTenantContext,
  middleSubscribers,
  runContextComputation,
} from '../../../shared'
import { PerfValue } from '../runtime'

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

  return (
    <PerfValue
      value={() => consumeSelectedValue(value(), 'app-context-subscriber')}
    />
  )
}

function AppLayout() {
  return (
    <>
      <For each={middleSubscribers}>
        {(selector) => <AppContextSubscriber selector={selector} />}
      </For>
      <Outlet />
    </>
  )
}
