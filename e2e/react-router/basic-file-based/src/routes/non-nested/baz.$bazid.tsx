import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/non-nested/baz/$bazid')({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()

  return (
    <>
      <div data-testid="non-nested-bazid-heading">
        Hello "/non-nested/baz/$bazid"!
      </div>
      <div>
        params:{' '}
        <span data-testid="non-nested-bazid-param">
          {JSON.stringify(params)}
        </span>
      </div>
    </>
  )
}
