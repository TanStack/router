import type { ViewTransitionOptions } from './router'

export interface MatchLocation {
  to?: string | number | null
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
}

export interface CommitLocationOptions {
  replace?: boolean
  resetScroll?: boolean
  hashScrollIntoView?: boolean | ScrollIntoViewOptions
  viewTransition?: boolean | ViewTransitionOptions
  /**
   * @deprecated All navigations use React transitions under the hood now
   **/
  startTransition?: boolean
  ignoreBlocker?: boolean
}
