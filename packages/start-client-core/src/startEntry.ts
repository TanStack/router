import type { AnyRouter, Awaitable } from '@tanstack/router-core'
import type { AnyStartConfig } from './createStart'

export interface StartEntry {
  getRouter: () => Awaitable<AnyRouter>
  getStart: (() => Awaitable<AnyStartConfig>) | undefined
}
