import { useRef } from 'react'
import { createFileRoute, useRouter } from '../routeScope.gen'
import { getProduct } from '../api'

export const Route = createFileRoute(
  '@start-route-modules/catalog:/$productId',
)({
  loader: ({ params }) => getProduct({ data: params.productId }),
  component: ProductPage,
})

function ProductPage() {
  const product = Route.useLoaderData()
  const router = useRouter()
  const refreshing = Route.useMatch({
    select: (match) => match.isFetching !== false,
  })
  // A render after the first one came from a refresh.
  const firstRenderedAt = useRef(product.renderedAt).current
  return (
    <article>
      <h3>{product.name}</h3>
      <p className="price" data-testid="price">
        {product.price.format()}
      </p>
      <div className="server-state">
        <p data-testid="shopper">Shopper: {product.shopper}</p>
        <p>
          Rendered at{' '}
          {/* Highlighted once each time a refresh brings a new render. */}
          <time
            key={product.renderedAt}
            className={
              product.renderedAt === firstRenderedAt ? 'data' : 'data fresh'
            }
            data-testid="rendered-at"
          >
            {new Date(product.renderedAt).toISOString().slice(11, 23)}
          </time>{' '}
          UTC
        </p>
      </div>
      <div className="actions">
        <button
          type="button"
          className="button"
          aria-busy={refreshing}
          // Runs this route's loader again: it calls the module's server
          // function from the client and updates the loader data.
          onClick={() =>
            router.invalidate({
              filter: (match) => match.routeId === Route.id,
            })
          }
        >
          Refresh
        </button>
        <Route.Link to="/">All products</Route.Link>
      </div>
    </article>
  )
}
