import { createRoute } from '@tanstack/solid-router'
import { createHeadLoaderData, createProductHead } from '../../../shared.ts'
import { Route as headRoute } from './head'

export const Route = createRoute({
  getParentRoute: () => headRoute,
  path: 'products/$productId',
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    createHeadLoaderData('product', params.productId, deps),
  head: ({ params, loaderData }) =>
    createProductHead(params.productId, loaderData!),
  component: ProductPage,
})

function ProductPage() {
  const params = Route.useParams()
  const loaderData = Route.useLoaderData()

  return (
    <div
      data-route-marker="product"
      data-product-id={params().productId}
      data-head-checksum={loaderData().checksum}
    />
  )
}
