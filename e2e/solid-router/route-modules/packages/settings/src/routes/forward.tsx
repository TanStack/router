import { createFileRoute, Navigate } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/solid-settings:/forward')({
  component: () => <Navigate to="/members" />,
})
