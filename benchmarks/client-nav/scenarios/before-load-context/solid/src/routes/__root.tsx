import { For } from 'solid-js'
import { Outlet, createRootRouteWithContext } from '@tanstack/solid-router'
import {
  consumeSelectedValue,
  rootSubscribers,
  runContextComputation,
  type RootBenchmarkContext,
} from '../../../shared'
import { PerfValue } from '../runtime'

export const Route = createRootRouteWithContext<RootBenchmarkContext>()({
  component: RootComponent,
})

function RootContextSubscriber(props: { selector: number }) {
  const value = Route.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.seed + context.version + props.selector,
        context.authToken,
        10,
      ),
  })

  return (
    <PerfValue
      value={() => consumeSelectedValue(value(), 'root-context-subscriber')}
    />
  )
}

function RootComponent() {
  return (
    <>
      <For each={rootSubscribers}>
        {(selector) => <RootContextSubscriber selector={selector} />}
      </For>
      <Outlet />
    </>
  )
}
