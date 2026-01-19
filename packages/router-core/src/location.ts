import type { ParsedHistoryState } from '@tanstack/history'
import type { AnySchema } from './validators'

/**
 * Per-route validated search result cached in snapshot.
 */
export interface ValidatedSearchEntry {
  /** Merged search (parent + this route's validated) */
  search: Record<string, unknown>
  /** Strict search (only this route's validated fields) */
  strictSearch: Record<string, unknown>
}

/**
 * Match snapshot stored in history state for fast-path on back/forward navigation.
 * Allows skipping path matching by storing route IDs and params.
 */
export interface MatchSnapshot {
  /** Ordered route IDs that matched */
  routeIds: Array<string>
  /** Raw path params extracted from the URL */
  params: Record<string, string>
  /** Parsed/validated path params */
  parsedParams: Record<string, unknown>
  /** Route ID that should show global not found, if any */
  globalNotFoundRouteId?: string
  /** Search string when snapshot was created (for cache invalidation) */
  searchStr?: string
  /** Per-route validated search results (parallel to routeIds) */
  validatedSearches?: Array<ValidatedSearchEntry>
}

export interface ParsedLocation<TSearchObj extends AnySchema = {}> {
  /**
   * The full path of the location, including pathname, search, and hash.
   * Does not include the origin. Is the equivalent of calling
   * `url.replace(url.origin, '')`
   */
  href: string
  /**
   * @description The pathname of the location, including the leading slash.
   */
  pathname: string
  /**
   * The parsed search parameters of the location in object form.
   */
  search: TSearchObj
  /**
   * The search string of the location, including the leading question mark.
   */
  searchStr: string
  /**
   * The in-memory state of the location as it *may* exist in the browser's history.
   */
  state: ParsedHistoryState
  /**
   * The hash of the location, including the leading hash character.
   */
  hash: string
  /**
   * The masked location of the location.
   */
  maskedLocation?: ParsedLocation<TSearchObj>
  /**
   * Whether to unmask the location on reload.
   */
  unmaskOnReload?: boolean
  /**
   * @private
   * @description The public href of the location.
   * If a rewrite is applied, the `href` property will be the rewritten URL.
   */
  publicHref: string
  /**
   * @private
   * @description The full URL of the location.
   * @private
   */
  url: URL
  /**
   * @internal
   * @description Match snapshot for fast-path on back/forward navigation.
   * Contains route IDs and params from buildLocation to avoid re-matching.
   */
  _matchSnapshot?: MatchSnapshot
}
