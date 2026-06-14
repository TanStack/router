import * as Vue from 'vue'
import { createRoute, useParams } from '@tanstack/vue-router'
import { createOutletsRemountsMarker } from '../../../shared'
import {
  createRouteLifecycleOptions,
  recordComponentMount,
} from '../outletsRemountsRuntime'
import { createRouteSection, readParam } from '../routeSection'
import { boardRoute } from './workspace.$orgId.projects.$projectId.boards.$boardId'

const CardPage = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () =>
      createOutletsRemountsMarker({
        kind: 'card',
        orgId: readParam(params.value, 'orgId'),
        projectId: readParam(params.value, 'projectId'),
        boardId: readParam(params.value, 'boardId'),
        cardId: readParam(params.value, 'cardId'),
      })
    const mountIndex = recordComponentMount('card', getMarker())

    return () => {
      const marker = getMarker()

      return createRouteSection(
        'card',
        marker,
        mountIndex,
        <main
          data-outlets-card-marker={marker}
          data-org-id={readParam(params.value, 'orgId')}
          data-project-id={readParam(params.value, 'projectId')}
          data-board-id={readParam(params.value, 'boardId')}
          data-card-id={readParam(params.value, 'cardId')}
        />,
      )
    }
  },
})

export const cardRoute = createRoute({
  getParentRoute: () => boardRoute,
  path: 'cards/$cardId',
  ...createRouteLifecycleOptions('card'),
  component: CardPage,
})
