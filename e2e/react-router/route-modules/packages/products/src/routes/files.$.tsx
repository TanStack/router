import { createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/products:/files/$')({
  component: () => (
    <>
      <h1>Files</h1>
      <p className="lead">Every path below files/ lands here.</p>
    </>
  ),
})
