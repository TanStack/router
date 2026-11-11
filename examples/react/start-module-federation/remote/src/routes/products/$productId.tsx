import { createFileRoute } from '@tanstack/react-router'
import ProductDetail from '~/components/ProductDetail'

export const Route = createFileRoute('/products/$productId')({
  component: ProductPage,
})

function ProductPage() {
  const { productId } = Route.useParams()
  return <ProductDetail productId={productId} />
}
