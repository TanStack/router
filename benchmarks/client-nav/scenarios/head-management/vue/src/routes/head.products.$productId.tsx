import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { createHeadLoaderData, createProductHead } from '../../../shared.ts'
import { Route as headRoute } from './head'

const ProductPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()
    const loaderData = Route.useLoaderData()

    return () => (
      <div
        data-route-marker="product"
        data-product-id={params.value.productId}
        data-head-checksum={loaderData.value.checksum}
      />
    )
  },
})

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
