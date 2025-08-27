import type { ParsedHistoryState } from '@tanstack/history'
import type { AnySchema } from './validators'

export interface ParsedLocation<TSearchObj extends AnySchema = {}> {
  /**
   * The URL instance representing the location. In future versions of TanStack Router,
   * this will be the preferred way to access basic url information. This will
   * not include derived properties like `fullPath`, the `search` object,
   * `maskedLocation`, or anything else that can already be found on the `URL` class.
   */
  url: URL
  /**
   * @deprecated In future versions of TanStack Router, `href` will
   * represent the full URL, including the origin. As a replacement,
   * please upgrade to the new `fullPath` property, which is derived by
   * combining `pathname`, `search`, and `hash`. like so:
   * `${pathname}${searchStr}${hash}`. If you'r looking for the actual
   * `href` of the location, you can use the `location.url.href` property.
   */
  href: string
  /**
   * The full path of the location, including pathname, search, and hash.
   * Does not include the origin. Is the equivalent of calling
   * `url.replace(url.origin, '')`
   */
  fullPath: string
  /**
   * @deprecated In future versions of TanStack Router, this property will be removed.
   * Please use the `location.url.pathname` property instead.
   * The pathname of the location, including the leading slash.
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
}
