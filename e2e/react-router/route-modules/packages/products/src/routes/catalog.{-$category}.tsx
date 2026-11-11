import { createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute(
  '@route-modules/products:/catalog/{-$category}',
)({
  component: () => (
    <>
      <h1>Catalog</h1>
      <p className="lead">The category segment of this path is optional.</p>
    </>
  ),
})
