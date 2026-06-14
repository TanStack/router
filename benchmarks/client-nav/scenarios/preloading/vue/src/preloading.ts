import { recordComponentPreload } from '../../shared'

export {
  BOOTSTRAP_INTENT_ITEM_ID,
  BOOTSTRAP_RENDER_REPORT_ID,
  BOOTSTRAP_VIEWPORT_ITEM_ID,
  DEFAULT_ITEM_SEARCH,
  DEFAULT_REPORT_SEARCH,
  INTENT_ITEM_SEARCH,
  VIEWPORT_ITEM_SEARCH,
  getPreloadingCounters,
  normalizeItemSearch,
  normalizePreloadIndexSearch,
  normalizeReportSearch,
  recordDetailLoader,
  recordItemBeforeLoad,
  recordItemLoader,
  recordLazyLoader,
  recordLazyRouteResolution,
  recordReportLoader,
  resetPreloadingCounters,
  runPreloadingComputation,
} from '../../shared'

export const staleWindowMs = 60_000
export const reportPreloadStaleWindowMs = 120_000

export function preloadComponent(
  kind: Parameters<typeof recordComponentPreload>[0],
) {
  recordComponentPreload(kind)
  return Promise.resolve()
}
