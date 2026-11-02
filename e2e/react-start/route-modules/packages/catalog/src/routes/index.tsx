import { createFileRoute } from '../routeScope.gen'
import { listProducts } from '../api'

export const Route = createFileRoute('@start-route-modules/catalog:/')({
  loader: () => listProducts(),
  component: CatalogPage,
})

function CatalogPage() {
  const products = Route.useLoaderData()
  return (
    <ul className="rows">
      {products.map((product) => (
        <li key={product.id}>
          <Route.Link to="/$productId" params={{ productId: product.id }}>
            {product.name}
          </Route.Link>
          <span className="meta" data-testid={`price-${product.id}`}>
            {product.price.format()}
          </span>
        </li>
      ))}
    </ul>
  )
}
