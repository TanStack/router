import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { SEARCH_ERROR_MARKER, validateControlFlowSearch } from '../../../shared'
import type { ControlFlowSearch } from '../../../shared'
import { createControlFlowMarkerElement } from '../control-flow'
import { rootRoute } from './__root'

const SearchErrorPage: ReturnType<typeof Vue.defineComponent> =
  Vue.defineComponent({
    setup() {
      return () => createControlFlowMarkerElement(SEARCH_ERROR_MARKER)
    },
  })

const SearchPage: ReturnType<typeof Vue.defineComponent> = Vue.defineComponent({
  setup() {
    const search = searchRoute.useSearch() as Vue.Ref<ControlFlowSearch>

    return () =>
      createControlFlowMarkerElement({
        branch: 'search-valid',
        value: search.value.token,
        checksum: search.value.checksum,
      })
  },
})

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/search',
  validateSearch: validateControlFlowSearch,
  errorComponent: SearchErrorPage,
  component: SearchPage,
})
