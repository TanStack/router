import type { AnyRouter, Awaitable } from '@tanstack/router-core'
import type { AnyStartInstance } from './createStart'

export interface StartEntry {
  getRouter: () => Awaitable<AnyRouter>
  startInstance: AnyStartInstance | undefined
}
