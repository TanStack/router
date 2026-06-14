import * as Vue from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'
import {
  consumeSelectedValue,
  deriveTenantContext,
  middleSubscribers,
  runContextComputation,
} from '../../../shared'

const AppContextSubscriber = Vue.defineComponent({
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
          context.tenantChecksum + props.selector,
          context.tenantId,
          10,
        ),
    })

    return () => {
      consumeSelectedValue(value.value, 'app-context-subscriber')
      return null
    }
  },
})

const AppLayout = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {middleSubscribers.map((selector) => (
          <AppContextSubscriber key={`app-${selector}`} selector={selector} />
        ))}
        <Outlet />
      </>
    )
  },
})

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => deriveTenantContext(context),
  component: AppLayout,
})
