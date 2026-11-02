import * as Vue from 'vue'
import { createFileRoute, Navigate } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/vue-settings:/forward')({
  component: () => <Navigate to="/members" />,
})
