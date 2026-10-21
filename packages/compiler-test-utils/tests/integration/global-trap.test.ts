/**
 * Control tests of the global trap (global-trap.ts) in a real Chromium page:
 * every way page code touches a trapped global is recorded. FINAL-PASS #48:
 * the former traps (accessors alone) did not record own-property probes
 * (`hasOwnProperty`, `Object.hasOwn`, ...); an `in` probe cannot be
 * recorded in a browser, so the code it guards is (it runs, as the
 * accessor makes the probe true).
 */
import { expect, onTestFinished, test } from 'vitest'
import { openPage } from '../../src/browser'
import { globalTrapSource } from '../../src/global-trap'

const timeout = 30_000

/** A page whose init script traps `$Trapped$` (`window.touches()`). */
async function trappedPage() {
  return openPage('http://trap.invalid/', {
    registerCleanup: onTestFinished,
    html: '<!doctype html><div id="app"></div>',
    initScript: `Object.defineProperty(window, 'touches', {
  value: ${globalTrapSource({ names: '["$Trapped$"]' })},
})`,
  })
}

test.each([
  ['a read', `window.$Trapped$`, ['read $Trapped$']],
  ['a write', `window.$Trapped$ = 1`, ['write $Trapped$']],
  [
    'code an `in` probe guards',
    `if ('$Trapped$' in window) { window.$Trapped$?.() }`,
    ['read $Trapped$'],
  ],
  ['`typeof` of the bare name', `typeof $Trapped$`, ['read $Trapped$']],
  ['a call of the bare name', `$Trapped$()`, ['read $Trapped$']],
  ['hasOwnProperty', `window.hasOwnProperty('$Trapped$')`, ['probe $Trapped$']],
  [
    'Object.prototype.hasOwnProperty.call',
    `Object.prototype.hasOwnProperty.call(globalThis, '$Trapped$')`,
    ['probe $Trapped$'],
  ],
  ['Object.hasOwn', `Object.hasOwn(window, '$Trapped$')`, ['probe $Trapped$']],
  [
    'propertyIsEnumerable',
    `window.propertyIsEnumerable('$Trapped$')`,
    ['probe $Trapped$'],
  ],
  [
    'getOwnPropertyDescriptor',
    `Object.getOwnPropertyDescriptor(window, '$Trapped$')`,
    ['probe $Trapped$'],
  ],
  ['Reflect.has', `Reflect.has(window, '$Trapped$')`, ['probe $Trapped$']],
  [
    'a definition',
    `Object.defineProperty(window, '$Trapped$', { value: 1, configurable: true })`,
    ['define $Trapped$', 'redefined $Trapped$'],
  ],
  ['a deletion', `delete window.$Trapped$`, ['redefined $Trapped$']],
])(
  '%s is recorded',
  async (_, code, expected) => {
    const page = await trappedPage()
    const touched = await page.page.evaluate(`(() => {
  try { ${code} } catch {}
  return window.touches()
})()`)
    expect(touched).toEqual(expected)
  },
  timeout,
)

test(
  'other names, other objects and the probes of other names record nothing',
  async () => {
    const page = await trappedPage()
    const seen = await page.page.evaluate(`(() => {
  window.other = 1
  const element = document.getElementById('app')
  element.expando = 2
  const plain = { $Trapped$: 3 }
  return {
    values: [
      window.other,
      element.expando,
      Object.hasOwn(window, 'other'),
      window.hasOwnProperty('other'),
      Object.hasOwn(plain, '$Trapped$'),
      Object.getOwnPropertyDescriptor(plain, '$Trapped$').value,
    ],
    touched: window.touches(),
  }
})()`)
    expect(seen).toEqual({ values: [1, 2, true, true, true, 3], touched: [] })
  },
  timeout,
)
