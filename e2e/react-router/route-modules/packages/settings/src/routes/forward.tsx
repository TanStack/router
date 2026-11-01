import * as React from 'react'
import { createFileRoute, Navigate } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/settings:/forward')({
  component: () => <Navigate to="/members" />,
})
