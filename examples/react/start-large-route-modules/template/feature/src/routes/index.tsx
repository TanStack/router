import { Link, createFileRoute } from '../routeScope.gen'
import { listItems } from '../api'

export const Route = createFileRoute('__MODULE_ID__:/')({
  loader: () => listItems(),
  component: Items,
})

function Items() {
  const { audience, items } = Route.useLoaderData()
  return (
    <>
      <p className="lead">Loaded on the server for {audience}.</p>
      <ul className="rows">
        {items.map((item) => (
          <li key={item.id}>
            <Link to="/$itemId" params={{ itemId: item.id }}>
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
