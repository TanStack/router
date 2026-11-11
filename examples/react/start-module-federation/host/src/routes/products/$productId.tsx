import { lazyRemote } from '@module-federation/tanstack/runtime'
import { createFileRoute } from '@tanstack/react-router'
import { preloadCatalog, stylesheetLinks } from '~/catalog'
import { RemoteBoundary } from '~/components/RemoteBoundary'

const ProductDetail = lazyRemote(() => import('catalog/ProductDetail'))

export const Route = createFileRoute('/products/$productId')({
  loader: () =>
    preloadCatalog('./ProductDetail', () => import('catalog/ProductDetail')),
  head: ({ loaderData }) => ({
    links: stylesheetLinks(loaderData?.stylesheets),
  }),
  component: ProductPage,
})

function ProductPage() {
  const { productId } = Route.useParams()

  return (
    <RemoteBoundary name="Catalog">
      <ProductDetail productId={productId} />
    </RemoteBoundary>
  )
}
