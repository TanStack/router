import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import minifiedTsrBootStrapScript from '../src/ssr/tsrScript?script-string'

type TsrBootstrap = {
  h: () => void
  e: () => void
  c: () => void
}

// Evaluate the real (minified) client bootstrap; it assigns `self.$_TSR`.
function installBootstrap(): TsrBootstrap {
  new Function(minifiedTsrBootStrapScript)()
  return (window as any).$_TSR
}

function setReadyState(value: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => value,
  })
}

describe('$_TSR client teardown', () => {
  beforeEach(() => {
    ;(window as any).$R = { tsr: [] }
    delete (window as any).$_TSR
  })

  afterEach(() => {
    delete (window as any).$_TSR
    delete (window as any).$R
    setReadyState('complete')
  })

  test('does not tear down until both hydrated and streamEnded', () => {
    setReadyState('complete')
    const tsr = installBootstrap()

    tsr.h()
    expect((window as any).$_TSR).toBeDefined()

    tsr.e()
    expect((window as any).$_TSR).toBeUndefined()
  })

  test('tears down immediately when the document is already parsed', () => {
    setReadyState('complete')
    const tsr = installBootstrap()

    tsr.h()
    tsr.e()

    expect((window as any).$_TSR).toBeUndefined()
    expect((window as any).$R.tsr).toBeUndefined()
  })

  // Regression: deferred/streamed deserializations can still arrive after the
  // `$_TSR.e()` stream-end marker (e.g. Solid 2 streams resource hydration past
  // it). Tearing `$_TSR` down immediately would make those late references
  // throw `$_TSR is not defined`, so teardown waits for the document to finish
  // parsing.
  test('keeps $_TSR alive until DOMContentLoaded while the document is still loading', () => {
    setReadyState('loading')
    const tsr = installBootstrap()

    tsr.h()
    tsr.e()

    // Still available for late streamed scripts.
    expect((window as any).$_TSR).toBeDefined()
    expect((window as any).$R.tsr).toBeDefined()

    document.dispatchEvent(new Event('DOMContentLoaded'))

    expect((window as any).$_TSR).toBeUndefined()
    expect((window as any).$R.tsr).toBeUndefined()
  })
})
