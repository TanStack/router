import type { HistoryLocation } from '@tanstack/history'

declare module '@tanstack/history' {
  interface HistoryState {
    __tempLocation?: HistoryLocation
    __tempKey?: string
    __hashChangeScrollIntoViewOptions?: boolean | ScrollIntoViewOptions
  }
}
