import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { routeSelectors, runPerfSelectorComputation } from '../shared'

const ContextParamsSubscriber = Vue.defineComponent({
  setup() {
    const params = Route.useParams({
      select: (params) => runPerfSelectorComputation(Number(params.id)),
    })

    return () => {
      void runPerfSelectorComputation(params.value)
      return null
    }
  },
})

const ContextRouteSubscriber = Vue.defineComponent({
  setup() {
    const context = Route.useRouteContext({
      select: (context) => runPerfSelectorComputation(context.sectionSeed),
    })

    return () => {
      void runPerfSelectorComputation(context.value)
      return null
    }
  },
})

const ContextPage = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {routeSelectors.map((selector) => (
          <ContextParamsSubscriber key={`context-params-${selector}`} />
        ))}
        {routeSelectors.map((selector) => (
          <ContextRouteSubscriber key={`context-route-${selector}`} />
        ))}
      </>
    )
  },
})

export const Route = createFileRoute('/ctx/$id')({
  beforeLoad: ({ params }) => ({
    sectionSeed: Number(params.id) * 13 + 1,
  }),
  component: ContextPage,
})
