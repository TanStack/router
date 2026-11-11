import { lazyRemote } from '@module-federation/tanstack/runtime'
import { createFileRoute } from '@tanstack/react-router'
import { preloadCatalog, stylesheetLinks } from '~/catalog'
import { RemoteBoundary } from '~/components/RemoteBoundary'
const ProductList = lazyRemote(() => import('catalog/ProductList'))

export const Route = createFileRoute('/products/')({
  loader: () =>
    preloadCatalog('./ProductList', () => import('catalog/ProductList')),
  head: ({ loaderData }) => ({
    links: stylesheetLinks(loaderData?.stylesheets),
  }),
  component: ProductsPage,
})

function ProductsPage() {
  return (
    <RemoteBoundary name="Catalog">
      <ProductList />
    </RemoteBoundary>
  )
}
