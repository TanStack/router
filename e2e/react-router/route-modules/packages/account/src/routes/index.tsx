import { Link, createFileRoute, products } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/account:/')({
  component: AccountHome,
})

function AccountHome() {
  const { user } = Route.useRouteContext()
  return (
    <div>
      <h1>{user.id}</h1>
      <p className="lead">
        Signed in. Your orders and what you looked at last.
      </p>
      <ul className="rows">
        <li>
          <Link to="/orders/$orderId" params={{ orderId: '1' }}>
            Last order
          </Link>
          <span className="meta">Order 1</span>
        </li>
        <li>
          <products.Link
            to="/$productId"
            params={{ productId: 'last-viewed' }}
            search={{ tab: 'reviews' }}
          >
            Last viewed product
          </products.Link>
          <span className="meta">Opens its reviews</span>
        </li>
      </ul>
    </div>
  )
}
