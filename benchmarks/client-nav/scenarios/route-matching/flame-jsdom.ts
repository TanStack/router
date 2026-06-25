import { window } from '../../jsdom.ts'

export function installRouteMatchingFlameGlobals() {
  const hadScrollTo = 'scrollTo' in globalThis
  const previousScrollTo = globalThis.scrollTo

  Object.defineProperty(globalThis, 'scrollTo', {
    configurable: true,
    value: window.scrollTo.bind(window),
    writable: true,
  })

  return () => {
    if (hadScrollTo) {
      Object.defineProperty(globalThis, 'scrollTo', {
        configurable: true,
        value: previousScrollTo,
        writable: true,
      })
      return
    }

    Reflect.deleteProperty(globalThis, 'scrollTo')
  }
}

export { window }
