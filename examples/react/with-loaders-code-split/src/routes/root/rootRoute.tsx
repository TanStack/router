import {
  lazyRouteComponent,
  rootRouteWithContext,
  RouterContext,
} from '@tanstack/react-router'
import { loaderClient } from '../../loaderClient'
import { Root } from './Root'

export const rootRoute = rootRouteWithContext<{
  loaderClient: typeof loaderClient
}>()({
  component: Root,
})
