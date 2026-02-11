import { describe, expect, test } from 'vitest'
import {
  getDehydrateFn,
  getHydrateFn,
  getRevalidateFn,
  resolveHandler,
  shouldDehydrate,
} from '../src/lifecycle'

describe('resolveHandler', () => {
  test('returns undefined for undefined input', () => {
    expect(resolveHandler(undefined)).toBeUndefined()
  })

  test('returns the function for function form', () => {
    const fn = () => 'hello'
    expect(resolveHandler(fn)).toBe(fn)
  })

  test('returns the handler for object form', () => {
    const handler = () => 'hello'
    expect(resolveHandler({ handler })).toBe(handler)
  })

  test('returns the handler for object form with dehydrate', () => {
    const handler = () => 'hello'
    expect(resolveHandler({ handler, dehydrate: true })).toBe(handler)
  })

  test('returns the handler for object form with dehydrate: false', () => {
    const handler = () => 'hello'
    expect(resolveHandler({ handler, dehydrate: false })).toBe(handler)
  })
})

describe('shouldDehydrate', () => {
  // Function form — no method-level dehydrate, falls to defaults
  test('function form uses router default when available', () => {
    const fn = () => 'hello'
    expect(shouldDehydrate(fn, true, false)).toBe(true)
    expect(shouldDehydrate(fn, false, true)).toBe(false)
  })

  test('function form uses builtin default when router default is undefined', () => {
    const fn = () => 'hello'
    expect(shouldDehydrate(fn, undefined, true)).toBe(true)
    expect(shouldDehydrate(fn, undefined, false)).toBe(false)
  })

  // Object form without dehydrate — falls to defaults
  test('object form without dehydrate uses router default', () => {
    const option = { handler: () => 'hello' }
    expect(shouldDehydrate(option, true, false)).toBe(true)
    expect(shouldDehydrate(option, false, true)).toBe(false)
  })

  test('object form without dehydrate uses builtin default when router default undefined', () => {
    const option = { handler: () => 'hello' }
    expect(shouldDehydrate(option, undefined, true)).toBe(true)
    expect(shouldDehydrate(option, undefined, false)).toBe(false)
  })

  // Object form with explicit dehydrate — overrides everything
  test('object form with dehydrate: true overrides router default false', () => {
    const option = { handler: () => 'hello', dehydrate: true }
    expect(shouldDehydrate(option, false, false)).toBe(true)
  })

  test('object form with dehydrate: false overrides router default true', () => {
    const option = { handler: () => 'hello', dehydrate: false }
    expect(shouldDehydrate(option, true, true)).toBe(false)
  })

  test('object form with dehydrate: true overrides builtin default false', () => {
    const option = { handler: () => 'hello', dehydrate: true }
    expect(shouldDehydrate(option, undefined, false)).toBe(true)
  })

  test('object form with dehydrate: false overrides builtin default true', () => {
    const option = { handler: () => 'hello', dehydrate: false }
    expect(shouldDehydrate(option, undefined, true)).toBe(false)
  })

  // Three-level priority chain
  test('method-level > router default > builtin default', () => {
    // All three present, method-level wins
    expect(
      shouldDehydrate({ handler: () => {}, dehydrate: true }, false, false),
    ).toBe(true)
    expect(
      shouldDehydrate({ handler: () => {}, dehydrate: false }, true, true),
    ).toBe(false)

    // No method-level, router default wins over builtin
    expect(shouldDehydrate({ handler: () => {} }, true, false)).toBe(true)
    expect(shouldDehydrate({ handler: () => {} }, false, true)).toBe(false)

    // No method-level, no router default, builtin wins
    expect(shouldDehydrate({ handler: () => {} }, undefined, true)).toBe(true)
    expect(shouldDehydrate({ handler: () => {} }, undefined, false)).toBe(false)
  })

  // dehydrate as a function — always counts as truthy
  test('object form with dehydrate function is treated as truthy', () => {
    const option = {
      handler: () => ({ dt: new Date() }),
      dehydrate: (v: any) => ({ iso: v.dt.toISOString() }),
      hydrate: (w: any) => ({ dt: new Date(w.iso) }),
    }
    // dehydrate-function overrides router default false and builtin false
    expect(shouldDehydrate(option, false, false)).toBe(true)
    expect(shouldDehydrate(option, undefined, false)).toBe(true)
  })
})

describe('getDehydrateFn', () => {
  test('returns undefined for undefined input', () => {
    expect(getDehydrateFn(undefined)).toBeUndefined()
  })

  test('returns undefined for function form', () => {
    expect(getDehydrateFn(() => 'hello')).toBeUndefined()
  })

  test('returns undefined for object form without dehydrate', () => {
    expect(getDehydrateFn({ handler: () => 'hello' })).toBeUndefined()
  })

  test('returns undefined for object form with dehydrate: true', () => {
    expect(
      getDehydrateFn({ handler: () => 'hello', dehydrate: true }),
    ).toBeUndefined()
  })

  test('returns undefined for object form with dehydrate: false', () => {
    expect(
      getDehydrateFn({ handler: () => 'hello', dehydrate: false }),
    ).toBeUndefined()
  })

  test('returns the dehydrate function for object form with dehydrate function', () => {
    const dehydrate = (v: any) => v.toString()
    const option = { handler: () => 'hello', dehydrate, hydrate: (w: any) => w }
    expect(getDehydrateFn(option)).toBe(dehydrate)
  })
})

describe('getHydrateFn', () => {
  test('returns undefined for undefined input', () => {
    expect(getHydrateFn(undefined)).toBeUndefined()
  })

  test('returns undefined for function form', () => {
    expect(getHydrateFn(() => 'hello')).toBeUndefined()
  })

  test('returns undefined for object form without hydrate', () => {
    expect(getHydrateFn({ handler: () => 'hello' })).toBeUndefined()
  })

  test('returns the hydrate function for object form with hydrate function', () => {
    const hydrateFn = (w: any) => new Date(w)
    const option = {
      handler: () => new Date(),
      dehydrate: (v: any) => v.toISOString(),
      hydrate: hydrateFn,
    }
    expect(getHydrateFn(option)).toBe(hydrateFn)
  })
})

describe('getRevalidateFn', () => {
  test('returns undefined for undefined input', () => {
    expect(getRevalidateFn(undefined)).toBeUndefined()
  })

  test('returns undefined for function form', () => {
    expect(getRevalidateFn(() => 'hello')).toBeUndefined()
  })

  test('returns undefined for object form without revalidate', () => {
    expect(getRevalidateFn({ handler: () => 'hello' })).toBeUndefined()
  })

  test('returns undefined for object form with revalidate: true', () => {
    expect(
      getRevalidateFn({ handler: () => 'hello', revalidate: true }),
    ).toBeUndefined()
  })

  test('returns undefined for object form with revalidate: false', () => {
    expect(
      getRevalidateFn({ handler: () => 'hello', revalidate: false }),
    ).toBeUndefined()
  })

  test('returns the revalidate function for object form with revalidate function', () => {
    const revalidateFn = (ctx: any) => ctx.prev + 1
    const option = { handler: () => 1, revalidate: revalidateFn }
    expect(getRevalidateFn(option)).toBe(revalidateFn)
  })
})
