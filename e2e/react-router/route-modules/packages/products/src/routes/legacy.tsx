import { createFileRoute, redirect } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/products:/legacy')({
  beforeLoad: () => {
    throw redirect({
      to: '/$productId',
      params: { productId: '42' },
      search: { tab: 'specs' },
    })
  },
})
