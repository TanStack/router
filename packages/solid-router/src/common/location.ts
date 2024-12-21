import type { HistoryState } from '@tanstack/history'
import type { AnySchema } from './validators'

export interface ParsedLocation<TSearchObj extends AnySchema = {}> {
  href: string
  pathname: string
  search: TSearchObj
  searchStr: string
  state: HistoryState
  hash: string
  maskedLocation?: ParsedLocation<TSearchObj>
  unmaskOnReload?: boolean
}
