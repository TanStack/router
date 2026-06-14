import { createRoute, redirect } from '@tanstack/react-router'
import {
  EmptyPage,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

export const redirectLoaderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/redirect-loader/$id',
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  loader: ({ params }) => {
    throw redirect({
      to: '/flow/target/$id',
      params: { id: params.id },
      replace: true,
    })
  },
  component: EmptyPage,
})
