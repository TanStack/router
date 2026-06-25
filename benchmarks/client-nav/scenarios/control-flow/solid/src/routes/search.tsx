import { createRoute } from '@tanstack/solid-router'
import {
  CONTROL_FLOW_PATHS,
  SEARCH_ERROR_MARKER,
  validateControlFlowSearch,
} from '../../../shared'
import type { ControlFlowSearch } from '../../../shared'
import { ControlFlowMarker } from '../control-flow'
import { rootRoute } from './__root'

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CONTROL_FLOW_PATHS.search,
  validateSearch: validateControlFlowSearch,
  errorComponent: SearchErrorPage,
  component: SearchPage,
})

function SearchErrorPage() {
  return <ControlFlowMarker {...SEARCH_ERROR_MARKER} />
}

function SearchPage() {
  const search = searchRoute.useSearch() as () => ControlFlowSearch

  return (
    <ControlFlowMarker
      branch="search-valid"
      value={search().token}
      checksum={search().checksum}
    />
  )
}
