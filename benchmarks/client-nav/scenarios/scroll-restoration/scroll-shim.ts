import type { ScrollPosition } from './shared'

type PropertySnapshot = {
  target: object
  key: PropertyKey
  descriptor: PropertyDescriptor | undefined
}

export type ScrollToCall = ScrollPosition & {
  target: string
  behavior: ScrollBehavior | undefined
}

export type ScrollIntoViewCall = {
  target: string
  options: boolean | ScrollIntoViewOptions | undefined
}

export interface ScrollShimController {
  dispatchElementScroll: (element: Element) => void
  dispatchWindowScroll: () => void
  getScrollIntoViewCalls: () => ReadonlyArray<ScrollIntoViewCall>
  getScrollToCalls: () => ReadonlyArray<ScrollToCall>
  getWindowPosition: () => ScrollPosition
  readElementPosition: (element: Element) => ScrollPosition
  restore: () => void
  setElementPosition: (element: Element, position: ScrollPosition) => void
  setWindowPosition: (position: ScrollPosition) => void
}

function snapshotProperty(target: object, key: PropertyKey): PropertySnapshot {
  return {
    target,
    key,
    descriptor: Object.getOwnPropertyDescriptor(target, key),
  }
}

function restoreProperty(snapshot: PropertySnapshot) {
  if (snapshot.descriptor) {
    Object.defineProperty(snapshot.target, snapshot.key, snapshot.descriptor)
    return
  }

  Reflect.deleteProperty(snapshot.target, snapshot.key)
}

function toFiniteNumber(value: unknown, fallback: number) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return number
}

function normalizeScrollToArgs(
  current: ScrollPosition,
  arg0?: ScrollToOptions | number,
  arg1?: number,
): ScrollPosition & { behavior: ScrollBehavior | undefined } {
  if (typeof arg0 === 'object' && arg0) {
    return {
      scrollLeft: toFiniteNumber(arg0.left, current.scrollLeft),
      scrollTop: toFiniteNumber(arg0.top, current.scrollTop),
      behavior: arg0.behavior,
    }
  }

  return {
    scrollLeft: toFiniteNumber(arg0, 0),
    scrollTop: toFiniteNumber(arg1, 0),
    behavior: undefined,
  }
}

function describeElement(element: Element) {
  return (
    element.getAttribute('data-scroll-restoration-id') ||
    element.id ||
    element.localName
  )
}

export function installScrollRestorationShims(): ScrollShimController {
  const activeWindow = window
  const activeDocument = document
  const snapshots: Array<PropertySnapshot> = []
  const elementPositions = new WeakMap<Element, ScrollPosition>()
  const scrollToCalls: Array<ScrollToCall> = []
  const scrollIntoViewCalls: Array<ScrollIntoViewCall> = []
  const previousHistoryScrollRestoration =
    activeWindow.history.scrollRestoration
  let windowPosition: ScrollPosition = {
    scrollLeft: toFiniteNumber(activeWindow.scrollX, 0),
    scrollTop: toFiniteNumber(activeWindow.scrollY, 0),
  }
  let restored = false

  const defineTrackedProperty = (
    target: object,
    key: PropertyKey,
    descriptor: PropertyDescriptor,
  ) => {
    snapshots.push(snapshotProperty(target, key))
    Object.defineProperty(target, key, descriptor)
  }

  const getElementPosition = (element: Element) => {
    let position = elementPositions.get(element)

    if (!position) {
      position = {
        scrollLeft: 0,
        scrollTop: 0,
      }
      elementPositions.set(element, position)
    }

    return position
  }

  const setWindowPosition = (position: ScrollPosition) => {
    windowPosition = {
      scrollLeft: position.scrollLeft,
      scrollTop: position.scrollTop,
    }
  }

  const windowScrollTo = (arg0?: ScrollToOptions | number, arg1?: number) => {
    const next = normalizeScrollToArgs(windowPosition, arg0, arg1)
    setWindowPosition(next)
    scrollToCalls.push({
      target: 'window',
      behavior: next.behavior,
      scrollLeft: next.scrollLeft,
      scrollTop: next.scrollTop,
    })
  }

  const elementScrollTo = function (
    this: Element,
    arg0?: ScrollToOptions | number,
    arg1?: number,
  ) {
    const current = getElementPosition(this)
    const next = normalizeScrollToArgs(current, arg0, arg1)
    current.scrollLeft = next.scrollLeft
    current.scrollTop = next.scrollTop
    scrollToCalls.push({
      target: describeElement(this),
      behavior: next.behavior,
      scrollLeft: next.scrollLeft,
      scrollTop: next.scrollTop,
    })
  }

  defineTrackedProperty(globalThis, 'scrollTo', {
    configurable: true,
    value: windowScrollTo,
    writable: true,
  })
  defineTrackedProperty(activeWindow, 'scrollTo', {
    configurable: true,
    value: windowScrollTo,
    writable: true,
  })
  defineTrackedProperty(globalThis, 'addEventListener', {
    configurable: true,
    value: activeWindow.addEventListener.bind(activeWindow),
    writable: true,
  })
  defineTrackedProperty(globalThis, 'removeEventListener', {
    configurable: true,
    value: activeWindow.removeEventListener.bind(activeWindow),
    writable: true,
  })

  for (const target of [globalThis, activeWindow]) {
    defineTrackedProperty(target, 'scrollX', {
      configurable: true,
      get() {
        return windowPosition.scrollLeft
      },
      set(value) {
        windowPosition.scrollLeft = toFiniteNumber(
          value,
          windowPosition.scrollLeft,
        )
      },
    })
    defineTrackedProperty(target, 'scrollY', {
      configurable: true,
      get() {
        return windowPosition.scrollTop
      },
      set(value) {
        windowPosition.scrollTop = toFiniteNumber(
          value,
          windowPosition.scrollTop,
        )
      },
    })
  }

  defineTrackedProperty(Element.prototype, 'scrollTo', {
    configurable: true,
    value: elementScrollTo,
    writable: true,
  })
  defineTrackedProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value(this: Element, options?: boolean | ScrollIntoViewOptions) {
      scrollIntoViewCalls.push({
        target: describeElement(this),
        options,
      })
    },
    writable: true,
  })
  defineTrackedProperty(Element.prototype, 'scrollLeft', {
    configurable: true,
    get(this: Element) {
      return getElementPosition(this).scrollLeft
    },
    set(this: Element, value: unknown) {
      getElementPosition(this).scrollLeft = toFiniteNumber(
        value,
        getElementPosition(this).scrollLeft,
      )
    },
  })
  defineTrackedProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      return getElementPosition(this).scrollTop
    },
    set(this: Element, value: unknown) {
      getElementPosition(this).scrollTop = toFiniteNumber(
        value,
        getElementPosition(this).scrollTop,
      )
    },
  })

  return {
    dispatchElementScroll(element) {
      element.dispatchEvent(
        new activeWindow.Event('scroll', {
          bubbles: true,
        }),
      )
    },
    dispatchWindowScroll() {
      activeDocument.dispatchEvent(
        new activeWindow.Event('scroll', {
          bubbles: true,
        }),
      )
    },
    getScrollIntoViewCalls() {
      return scrollIntoViewCalls
    },
    getScrollToCalls() {
      return scrollToCalls
    },
    getWindowPosition() {
      return { ...windowPosition }
    },
    readElementPosition(element) {
      const position = getElementPosition(element)
      return { ...position }
    },
    restore() {
      if (restored) {
        return
      }

      restored = true
      activeWindow.history.scrollRestoration = previousHistoryScrollRestoration

      for (const snapshot of snapshots.reverse()) {
        restoreProperty(snapshot)
      }
    },
    setElementPosition(element, position) {
      element.scrollLeft = position.scrollLeft
      element.scrollTop = position.scrollTop
    },
    setWindowPosition,
  }
}
