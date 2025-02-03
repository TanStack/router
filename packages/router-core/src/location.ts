import type { ParsedHistoryState } from '@tanstack/history'
import type { AnySchema } from './validators'

export interface ParsedLocation<TSearchObj extends AnySchema = {}> {
  href: string
  pathname: string
  search: TSearchObj
  searchStr: string
  state: ParsedHistoryState
  hash: string
  maskedLocation?: ParsedLocation<TSearchObj>
  unmaskOnReload?: boolean
}
