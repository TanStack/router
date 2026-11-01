import { createFileRoute, getRouteApi, products } from '../routeScope.gen'

const productRoute = getRouteApi('@route-modules/products:/$productId')

export const Route = createFileRoute('@route-modules/account:/orders/$orderId')(
  {
    loader: ({ params }) => ({ orderId: params.orderId, productId: 'p-1' }),
    component: OrderPage,
  },
)

function OrderPage() {
  const order = Route.useLoaderData()
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

export function useOrderedProduct() {
  return productRoute.useLoaderData()
}
