/**
 * Augments `@tanstack/history` types with the bookkeeping fields the
 * router stores on history state. Pure type-level — same as the React
 * binding's `history.ts`.
 */
import type { HistoryLocation } from '@tanstack/history'

declare module '@tanstack/history' {
  interface HistoryState {
    __tempLocation?: HistoryLocation
    __tempKey?: string
    __hashScrollIntoViewOptions?: boolean | ScrollIntoViewOptions
  }
}

export {}
