import { useQuery } from '@tanstack/vue-query'
import { createFileRoute, redirect } from '@tanstack/vue-router'
import { createServerFn, useServerFn } from '@tanstack/vue-start'
import { Suspense } from 'solid-js'

const $redirectServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    throw redirect({ to: '/redirect-test-ssr/target' })
  },
)

export const Route = createFileRoute('/redirect-test-ssr/')({
  component: RouteComponent,
  ssr: true,
})

function RouteComponent() {
  const redirectFn = useServerFn($redirectServerFn)
  const query = useQuery(() => ({
    queryKey: ['redirect-test-ssr'],
    queryFn: () => redirectFn(),
  }))

  return (
    <div>
      <h1 data-testid="redirect-source-ssr">Redirect Source SSR</h1>
      <Suspense>
        <div>{JSON.stringify(query.data)}</div>
      </Suspense>
    </div>
  )
}
