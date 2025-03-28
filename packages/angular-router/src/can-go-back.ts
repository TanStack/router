import {
  assertInInjectionContext,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { routerState$ } from './router-state';

export function canGoBack$({ injector }: { injector?: Injector } = {}) {
  !injector && assertInInjectionContext(canGoBack$);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return routerState$({
      select: (s) => s.location.state.__TSR_index !== 0,
      injector,
    });
  });
}

export function canGoBack({ injector }: { injector?: Injector } = {}) {
  !injector && assertInInjectionContext(canGoBack);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    return toSignal(canGoBack$({ injector }));
  });
}
