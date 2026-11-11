import { Link, account, createFileRoute, storefront } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/products:/')({
  loader: ({ context }) => context.productsApi.listProducts(),
  component: ProductList,
})

function ProductList() {
  const products = Route.useLoaderData()
  return (
    <>
      <p className="meta">
        {/* Links into modules that link back here: account uses products, and
            storefront mounts products. Both compile against the stand-ins in
            .tanstack/route-types-stubs.d.ts during the declaration build. */}
        <account.Link to="/orders/$orderId" params={{ orderId: '1' }}>
          My last order
        </account.Link>{' '}
        <storefront.Link to="/cart">Go to cart</storefront.Link>
      </p>
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
    </>
  )
}
