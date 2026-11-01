import { Link, account, createFileRoute } from '../routeScope.gen'
import { getItem } from '../api'

export const Route = createFileRoute('__MODULE_ID__:/$itemId')({
  loader: ({ params }) => getItem({ data: params.itemId }),
  component: Item,
})

function Item() {
  const item = Route.useLoaderData()
  return (
    <article>
      <h3>{item.name}</h3>
      <dl className="facts">
        <dt>Quantity</dt>
        <dd>{item.quantity}</dd>
        <dt>Viewed by</dt>
        <dd>
          <code>{item.viewedBy}</code>
        </dd>
      </dl>
      <p>
        <Link to="/">All items</Link> ·{' '}
        <account.Link to="/">Your account</account.Link>
      </p>
    </article>
  )
}
