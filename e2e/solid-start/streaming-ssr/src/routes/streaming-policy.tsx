import { Await, createFileRoute, useRouter } from '@tanstack/solid-router'
import { Suspense } from 'solid-js'

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

function StreamingPolicyRoute() {
  const router = useRouter()
  const loaderData = Route.useLoaderData()
  const serverSsr = router.serverSsr
  const render = serverSsr?.shouldStream('render')
  const head = serverSsr?.shouldStream('head')

  return (
    <div style={{ padding: '20px' }}>
      <h2>Streaming Policy Test</h2>
      <div data-testid="policy-render">{String(render)}</div>
      <div data-testid="policy-head">{String(head)}</div>
      <div data-testid="policy-immediate">{loaderData().immediate}</div>
      <Suspense fallback={<div>Loading policy content...</div>}>
        <Await
          promise={loaderData().deferred}
          children={(value) => <div data-testid="policy-deferred">{value}</div>}
        />
      </Suspense>
    </div>
  )
}
