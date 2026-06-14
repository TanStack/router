import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import {
  consumeSelectedValue,
  rootSubscribers,
  runContextComputation,
  type RootBenchmarkContext,
} from '../../../shared'

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

  consumeSelectedValue(value, 'root-context-subscriber')
  return null
}

function RootComponent() {
  return (
    <>
      {rootSubscribers.map((selector) => (
        <RootContextSubscriber key={`root-${selector}`} selector={selector} />
      ))}
      <Outlet />
    </>
  )
}
