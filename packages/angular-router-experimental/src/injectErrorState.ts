import * as Angular from '@angular/core'

export const ERROR_STATE_INJECTOR_TOKEN = new Angular.InjectionToken<{
  error: Error
  reset: () => void
  info: { componentStack: string }
}>('ERROR_STATE_INJECTOR_TOKEN')

/**
 * Injects the error state to the error componenet.
 */

export function injectErrorState() {
  const errorState = Angular.inject(ERROR_STATE_INJECTOR_TOKEN, {
    optional: true,
  })
  if (!errorState) {
    throw new Error('injectErrorState was called outside of an error component')
  }
  return errorState
}
