import * as Vue from 'vue'
import { createRoute, useParams } from '@tanstack/vue-router'
import {
  createOutletsRemountsMarker,
  readOutletsRemountsParam,
} from '../../../shared'
import {
  createRouteLifecycleOptions,
  recordComponentMount,
} from '../outletsRemountsRuntime'
import { createRouteSection } from '../routeSection'
import { boardRoute } from './workspace.$orgId.projects.$projectId.boards.$boardId'

const CardPage = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () =>
      createOutletsRemountsMarker({
        kind: 'card',
        orgId: readOutletsRemountsParam(params.value, 'orgId'),
        projectId: readOutletsRemountsParam(params.value, 'projectId'),
        boardId: readOutletsRemountsParam(params.value, 'boardId'),
        cardId: readOutletsRemountsParam(params.value, 'cardId'),
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
          data-org-id={readOutletsRemountsParam(params.value, 'orgId')}
          data-project-id={readOutletsRemountsParam(params.value, 'projectId')}
          data-board-id={readOutletsRemountsParam(params.value, 'boardId')}
          data-card-id={readOutletsRemountsParam(params.value, 'cardId')}
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
