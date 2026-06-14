import { createRoute, redirect } from '@tanstack/vue-router'
import {
  EmptyPage,
  parseFlowParams,
  stringifyFlowParams,
} from '../control-flow'
import { rootRoute } from './__root'

export const redirectBeforeLoadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/redirect-before-load/$id',
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/flow/target/$id',
      params: { id: params.id },
      replace: true,
    })
  },
  component: EmptyPage,
})
