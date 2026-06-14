import * as Vue from 'vue'
import { Outlet, createRoute, useParams } from '@tanstack/vue-router'
import { createOutletsRemountsBoardMarker } from '../../../shared'
import {
  createRouteLifecycleOptions,
  recordComponentMount,
} from '../outletsRemountsRuntime'
import { createRouteSection } from '../routeSection'
import { projectRoute } from './workspace.$orgId.projects.$projectId'

const BoardLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () => createOutletsRemountsBoardMarker(params.value)
    const mountIndex = recordComponentMount('board', getMarker())

    return () =>
      createRouteSection('board', getMarker(), mountIndex, <Outlet />)
  },
})

export const boardRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'boards/$boardId',
  ...createRouteLifecycleOptions('board'),
  remountDeps: ({ params }) => ({
    boardId: params.boardId,
  }),
  component: BoardLayout,
})
