import { createFileRoute } from '../../routeScope.gen'

export const Route = createFileRoute('@route-modules/products:/_layout/deals')({
  component: () => (
    <>
      <h1>Deals</h1>
      <p className="lead">
        Rendered through a pathless layout of the products module.
      </p>
    </>
  ),
})
