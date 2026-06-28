import { Await, createFileRoute, useRouter } from '@tanstack/vue-router'
import { Suspense, defineComponent } from 'vue'

const StreamingPolicyRoute = defineComponent({
  setup() {
    const router = useRouter()
    const loaderData = Route.useLoaderData()
    const serverSsr = router.serverSsr
    const render = serverSsr?.shouldStream('render')
    const head = serverSsr?.shouldStream('head')

    return () => (
      <div class="p-2">
        <h3>Streaming Policy Test</h3>
        <div data-testid="policy-render">{String(render)}</div>
        <div data-testid="policy-head">{String(head)}</div>
        <div data-testid="policy-immediate">{loaderData.value.immediate}</div>
        <Suspense>
          {{
            default: () => (
              <Await
                promise={loaderData.value.deferred}
                children={(value: string) => (
                  <div data-testid="policy-deferred">{value}</div>
                )}
              />
            ),
            fallback: () => <div>Loading policy content...</div>,
          }}
        </Suspense>
      </div>
    )
  },
})

export const Route = createFileRoute('/streaming-policy')({
  loader: () => {
    return {
      immediate: 'Immediate policy content',
      deferred: new Promise<string>((resolve) => {
        setTimeout(() => resolve('Deferred policy content'), 100)
      }),
    }
  },
  component: StreamingPolicyRoute,
})
