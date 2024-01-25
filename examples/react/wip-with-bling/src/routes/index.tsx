import { createRoute } from '@tanstack/react-router'
import * as React from 'react'
import { rootRoute } from './root'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  ),
})
