import { createRouter } from '@tanstack/react-router'
import { Route as rootRoute } from './routes/__root'
import { Route as indexRoute } from './routes/index'
import './server-fns/posts'

const routeTree = rootRoute.addChildren([indexRoute])

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
  })
}
