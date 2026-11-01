import { createFileRoute } from '../routeScope.gen'
import { getAccount } from '../api'

export const Route = createFileRoute('@large-route-modules/account:/')({
  loader: () => getAccount(),
  component: Account,
})

function Account() {
  const account = Route.useLoaderData()
  return (
    <dl className="facts">
      <dt>Name</dt>
      <dd>{account.name}</dd>
      <dt>Plan</dt>
      <dd>{account.plan}</dd>
      <dt>Seats</dt>
      <dd>{account.seats}</dd>
    </dl>
  )
}
