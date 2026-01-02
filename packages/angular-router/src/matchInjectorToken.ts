import { InjectionToken, signal, Signal } from '@angular/core'

export const MATCH_ID_INJECTOR_TOKEN = new InjectionToken<
  Signal<string | undefined>
>('MATCH_ID_INJECTOR', {
  factory: () => signal(undefined),
})
