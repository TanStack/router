import { createFileRoute } from '@tanstack/react-router'
import { feature } from '../routeScope.gen'

export const Route = createFileRoute('/')({
  component: IndexComponent,
})

// Links into the mounted route module through its namespace.
function IndexComponent() {
  return <feature.Link to="/">Feature</feature.Link>
}
