/**
 * Not part of the compiler test corpus (harness controls): the production
 * mode of the public Start host (`../../start-host`, `preview()`), whose
 * page records every touch of a development-only global
 * (`devSupportTouches()`, the behavioural G7 check of
 * `integration/start-compiler-build-ids.test.ts` "build providers have no
 * dev HMR code"). Each control plants what a leaked development transform
 * would run, in user code a real build ships, and the record must show it.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createStartHost, inPage } from '../../regression-helpers'
import type { StartCase, StartHost } from '../../regression-helpers'

let host: StartHost | undefined
let cases: Record<'registers' | 'guarded' | 'bookkeeping', StartCase>

beforeAll(async () => {
  host = await createStartHost({ serve: false })
  cases = {
    // React Refresh's registration, as its dev transform emits it
    registers: await host.case({
      'module.tsx': `export const Page = () => null
$RefreshReg$(Page, 'Page')
export const ran = true
`,
      'refresh.d.ts': `declare function $RefreshReg$(type: unknown, id: string): void\n`,
    }),
    // A guard that reads the global (a check left in production)
    guarded: await host.case({
      'module.tsx': `export const ran = typeof (window as any).$RefreshSig$ === 'function'\n`,
    }),
    // The router plugin's React Refresh bookkeeping without its guard
    bookkeeping: await host.case({
      'module.tsx': `const w = window as any
w.__TSR_REACT_REFRESH__ ??= { ignoredExportsById: new Map() }
export const ran = true
`,
    }),
  }
  await host.preview()
}, 120_000)

afterAll(async () => {
  await host?.close()
})

describe('the production page records development-only globals', () => {
  test('control: the hydrated page alone touches none', async () => {
    expect(await host!.devSupportTouches()).toEqual([])
  })

  test.each([
    ['registers', '$RefreshReg$'],
    ['guarded', '$RefreshSig$'],
    ['bookkeeping', '__TSR_REACT_REFRESH__'],
  ] as const)('%s: %s', async (name, global) => {
    const before = (await host!.devSupportTouches()).length
    await inPage(cases[name], 'return null').catch(() => {})
    const touches = (await host!.devSupportTouches()).slice(before)
    expect(touches.some((touch) => touch.includes(global))).toBe(true)
  })
})
