import { createFileRoute } from '../routeScope.gen'
import { productSearchSchema } from '../schemas'

export const Route = createFileRoute('@route-modules/products:/$productId')({
  validateSearch: productSearchSchema,
  loader: ({ params, context }) =>
    context.productsApi.getProduct(params.productId),
  component: ProductPage,
})

function ProductPage() {
  const product = Route.useLoaderData()
  const { tab } = Route.useSearch()
  return (
    <article>
      <h1>{product.name}</h1>
      <dl className="facts">
        <dt>Price</dt>
        <dd>{product.price.toFixed(2)}</dd>
        <dt>Product id</dt>
        <dd>
          <code>{product.id}</code>
        </dd>
      </dl>
      <nav className="tabs" aria-label="Product sections">
        <Route.Link
          to="."
          search={{ tab: 'specs' }}
          aria-current={tab === 'specs' ? 'true' : undefined}
        >
          Specs
        </Route.Link>
        <Route.Link
          to="."
          search={{ tab: 'reviews' }}
          aria-current={tab === 'reviews' ? 'true' : undefined}
        >
          Reviews
        </Route.Link>
      </nav>
      <p className="lead">
        {tab === 'specs'
          ? 'Dimensions, materials and care.'
          : 'What customers say about it.'}
      </p>
      <Route.Link to="/">All products</Route.Link>
    </article>
  )
}
