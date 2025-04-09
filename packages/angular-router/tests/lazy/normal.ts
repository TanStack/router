import { createLazyFileRoute, createLazyRoute } from '../../src'
import { NormalRoute } from './normal-route'
import { NormalFileRoute } from './normal-file-route'

export function Route(id: string) {
  return createLazyRoute(id)({
    component: () => NormalRoute,
  })
}

export function FileRoute(id: string) {
  return createLazyFileRoute(id as never)({
    component: () => NormalFileRoute,
  })
}
