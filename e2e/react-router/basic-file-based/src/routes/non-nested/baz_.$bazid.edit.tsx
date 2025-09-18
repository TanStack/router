import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/non-nested/baz_/$bazid/edit')({
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  return (
    <>
      <div data-testid="non-nested-bazid-edit-heading">
        Hello "/non-nested/baz_/$bazid/edit"!
      </div>
      <div>
        params:{' '}
        <span data-testid="non-nested-bazid-edit-param">
          {JSON.stringify(params)}
        </span>
      </div>
    </>
  )
}
