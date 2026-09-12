import type { HistoryLocation } from '@tanstack/history'

export const resetScrollStateKey = '__TSR_resetScroll'

declare module '@tanstack/history' {
  interface HistoryState {
    __tempLocation?: HistoryLocation
    __tempKey?: string
    __hashScrollIntoViewOptions?: boolean | ScrollIntoViewOptions
    [resetScrollStateKey]?: boolean
  }
}
