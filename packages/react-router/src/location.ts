import type { HistoryState } from '@tanstack/history'
import type { AnySearchSchema } from './route'

export interface ParsedLocation<TSearchObj extends AnySearchSchema = {}> {
  href: string
  pathname: string
  search: TSearchObj
  searchStr: string
  state: HistoryState
  hash: string
  maskedLocation?: ParsedLocation<TSearchObj>
  unmaskOnReload?: boolean
}
