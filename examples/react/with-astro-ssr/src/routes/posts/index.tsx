import { Route } from '@tanstack/react-router'
import * as React from 'react'
import { postsRoute } from '../posts'

export const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '/',
  component: () => <div>Select a post.</div>,
})
