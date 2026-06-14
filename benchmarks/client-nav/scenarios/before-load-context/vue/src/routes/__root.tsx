import * as Vue from 'vue'
import { Outlet, createRootRouteWithContext } from '@tanstack/vue-router'
import {
  runContextComputation,
  type RootBenchmarkContext,
} from '../../../shared'
import { consumeSelectedValue, rootSubscribers } from '../runtime'

const RootContextSubscriber = Vue.defineComponent({
  props: {
    selector: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = Route.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.seed + context.version + props.selector,
          context.authToken,
          10,
        ),
    })

    return () => {
      consumeSelectedValue(value.value, 'root-context-subscriber')
      return null
    }
  },
})

const RootComponent = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {rootSubscribers.map((selector) => (
          <RootContextSubscriber key={`root-${selector}`} selector={selector} />
        ))}
        <Outlet />
      </>
    )
  },
})

export const Route = createRootRouteWithContext<RootBenchmarkContext>()({
  component: RootComponent,
})
