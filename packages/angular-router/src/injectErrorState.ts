import { inject, InjectionToken } from '@angular/core'

export const ERROR_STATE_INJECTOR_TOKEN = new InjectionToken<{
  error: Error
  reset: () => void
  info: { componentStack: string }
}>('ERROR_STATE_INJECTOR_TOKEN')

/**
 * Injects the error state to the error componenet.
 */

export function injectErrorState() {
  const errorState = inject(ERROR_STATE_INJECTOR_TOKEN, { optional: true })
  if (!errorState) {
    throw new Error('injectErrorState was called outside of an error component')
  }
  return errorState
}
