import { describe, expect, it, vi } from 'vitest'
import { lazyRouteComponent } from '../../src/lazyRouteComponent'

describe('lazyRouteComponent server import cache (#8950)', () => {
  it('does not reuse a pending server import across loads', async () => {
    let resolveSecond: (value: { default: () => null }) => void
    const importer = vi
      .fn<() => Promise<{ default: () => null }>>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve
          }),
      )

    const Page = lazyRouteComponent(importer)
    const first = Page.preload?.()
    const second = Page.preload?.()

    expect(first).not.toBe(second)
    expect(importer).toHaveBeenCalledTimes(2)

    const Comp = () => null
    resolveSecond!({ default: Comp })
    await second

    expect(Page.preload?.()).toBe(second)
    expect(importer).toHaveBeenCalledTimes(2)
  })
})
