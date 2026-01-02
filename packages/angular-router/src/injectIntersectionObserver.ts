import {
  ElementRef,
  inject,
  afterNextRender,
  afterRenderEffect,
} from '@angular/core'

export function injectIntersectionObserver(
  callback: (entry: IntersectionObserverEntry | undefined) => void,
  intersectionObserverOptions: IntersectionObserverInit,
  disabled: () => boolean,
) {
  const elementRef = inject(ElementRef)

  afterRenderEffect((onCleanup) => {
    const isDisabled = disabled()
    const element = elementRef.nativeElement as HTMLElement | null
    if (isDisabled || !element) return

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
