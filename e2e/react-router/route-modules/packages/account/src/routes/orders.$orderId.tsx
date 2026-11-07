import { createFileRoute, products } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/account:/orders/$orderId')(
  {
    loader: ({ params }) => ({ orderId: params.orderId, productId: 'p-1' }),
    component: OrderPage,
  },
)

function OrderPage() {
  const order = Route.useLoaderData()
  // Routes of a used module are addressed through its namespace: the module's
  // own scope only knows its own routes and the modules it includes.
  const navigateToProduct = products.useNavigate()
  return (
    <div>
      <h1>{order.orderId}</h1>
      <dl className="facts">
        <dt>Status</dt>
        <dd>Delivered</dd>
        <dt>Product</dt>
        <dd>
          <code>{order.productId}</code>
        </dd>
      </dl>
      <button
        type="button"
        className="button"
        onClick={() =>
          navigateToProduct({
            to: '/$productId',
            params: { productId: order.productId },
          })
        }
      >
        Ordered product
      </button>
    </div>
  )
}
