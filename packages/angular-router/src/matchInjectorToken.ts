import * as Angular from '@angular/core'

export const MATCH_ID_INJECTOR_TOKEN = new Angular.InjectionToken<
  Angular.Signal<string | undefined>
>('MATCH_ID_INJECTOR', {
  factory: () => Angular.signal(undefined),
})

// N.B. this only exists so we can conditionally inject a value when we are not interested in the nearest match
export const DUMMY_MATCH_ID_INJECTOR_TOKEN = new Angular.InjectionToken<
  Angular.Signal<string | undefined>
>('DUMMY_MATCH_ID_INJECTOR', {
  factory: () => Angular.signal(undefined),
})
