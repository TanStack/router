import * as Vue from 'vue'
import { Outlet, createRoute, useParams } from '@tanstack/vue-router'
import {
  createRouteLifecycleOptions,
  recordComponentMount,
} from '../outletsRemountsRuntime'
import { createRouteSection, readParam } from '../routeSection'
import { projectRoute } from './workspace.$orgId.projects.$projectId'

const BoardLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () =>
      `board:${readParam(params.value, 'orgId')}:${readParam(params.value, 'projectId')}:${readParam(params.value, 'boardId')}`
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
