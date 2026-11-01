import { createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/storefront:/cart')({
  // The products API comes from the context the storefront requires.
  loader: ({ context }) =>
    Promise.all(['1', '2'].map((id) => context.productsApi.getProduct(id))),
  component: Cart,
})

function Cart() {
  const items = Route.useLoaderData()
  const total = items.reduce((sum, item) => sum + item.price, 0)
  return (
    <>
      <h1>Cart</h1>
      <ul className="rows">
        {items.map((item) => (
          <li key={item.id}>
            {item.name}
            <span className="meta">{item.price.toFixed(2)}</span>
          </li>
        ))}
        <li>
          <strong>Total</strong>
          <strong>{total.toFixed(2)}</strong>
        </li>
      </ul>
    </>
  )
}
