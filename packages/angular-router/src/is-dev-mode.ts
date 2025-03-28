import { DOCUMENT } from '@angular/common';
import {
  assertInInjectionContext,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';

export function isDevMode({ injector }: { injector?: Injector } = {}) {
  !injector && assertInInjectionContext(isDevMode);

  if (!injector) {
    injector = inject(Injector);
  }

  return runInInjectionContext(injector, () => {
    const document = inject(DOCUMENT);
    const window = document.defaultView;
    return !!window && 'ng' in window;
  });
}
