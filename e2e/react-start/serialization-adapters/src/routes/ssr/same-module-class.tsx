import { createFileRoute } from '@tanstack/react-router'
import { describeMoney, getBudget } from '~/Money'

export const Route = createFileRoute('/ssr/same-module-class')({
  loader: () => getBudget(),
  component: RouteComponent,
})

function RouteComponent() {
  const budget = Route.useLoaderData()
  return (
    <div data-testid="same-module-class-loader">{describeMoney(budget)}</div>
  )
}
