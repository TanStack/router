import { Link, createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/products:/')({
  loader: ({ context }) => context.productsApi.listProducts(),
  component: ProductList,
})

function ProductList() {
  const products = Route.useLoaderData()
  return (
    <ul className="rows">
      {products.map((product) => (
        <li key={product.id}>
          <Link to="/$productId" params={{ productId: product.id }}>
            {product.name}
          </Link>
          <span className="meta">{product.price.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  )
}
