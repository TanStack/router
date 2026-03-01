import * as Angular from '@angular/core'

export function injectIntersectionObserver(
  callback: (entry: IntersectionObserverEntry | undefined) => void,
  intersectionObserverOptions: IntersectionObserverInit,
  disabled: () => boolean,
) {
  const elementRef = Angular.inject(Angular.ElementRef)

  Angular.afterRenderEffect((onCleanup) => {
    const isIntersectionObserverAvailable =
      typeof IntersectionObserver === 'function'

    const element = elementRef.nativeElement as HTMLElement | null
    if (!element || !isIntersectionObserverAvailable || disabled()) return

    const observer = new IntersectionObserver(
      ([entry]) => callback(entry),
      intersectionObserverOptions,
    )

    observer.observe(element)

    onCleanup(() => {
      observer.disconnect()
    })
  })
}
