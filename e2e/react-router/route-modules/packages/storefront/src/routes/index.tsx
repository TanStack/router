import { Link, createFileRoute, products } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/storefront:/')({
  component: StorefrontHome,
})

function StorefrontHome() {
  return (
    <nav aria-label="Storefront">
      <ul className="rows">
        <li>
          <Link to="/cart">Cart</Link>
          <span className="meta">Two products waiting</span>
        </li>
        <li>
          <products.Link to="/$productId" params={{ productId: 'featured' }}>
            Featured product
          </products.Link>
          <span className="meta">Picked by the storefront</span>
        </li>
        <li>
          <products.Link to="/compare" search={{ ids: ['1', '2'] }}>
            Compare
          </products.Link>
          <span className="meta">Products 1 and 2 side by side</span>
        </li>
      </ul>
    </nav>
  )
}
