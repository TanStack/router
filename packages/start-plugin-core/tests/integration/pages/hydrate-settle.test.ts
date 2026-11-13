/**
 * Controls of the render kit's wait (`render.ts`): the run ends once what the
 * page's gates let through was requested, whenever the browser gets to it, and
 * `expectRenderedThroughChunks` still fails a page that requested no split
 * code.
 */
import { expect, test } from 'vitest'
import {
  expectClientRendersLikeServer,
  expectRenderedThroughChunks,
  renderClient,
  useHydrateHost,
} from '../../render'

const hosts = useHydrateHost()

const visibleBoundary = `import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={visible()}><p>child</p></Hydrate>
}`

test('a visible gate the browser reaches late still counts: its split code was requested', async () => {
  const client = await renderClient(await hosts(), visibleBoundary, {
    freshPage: true,
    // Every observer of the page hears of an intersection 250 ms late, as on a
    // machine that produces its frames late. The page's next run gets the real
    // one back.
    setup: `const Observer = globalThis.IntersectionObserver
if (Observer) {
  globalThis.IntersectionObserver = class extends Observer {
    constructor(notify, options) {
      super((...args) => setTimeout(() => notify(...args), 250), options)
    }
  }
}
export const restore = () => {
  globalThis.IntersectionObserver = Observer
}`,
    script: 'setup.restore()',
  })
  expect(client.recoverableErrors).toEqual([])
  expectRenderedThroughChunks(client)
})

test('a page that requests no split code fails the check', async () => {
  // Not a boundary: nothing is split.
  await expect(
    expectClientRendersLikeServer(
      await hosts(),
      `function Hydrate({ children }) {
  return <div>{children}</div>
}
export function Page() {
  return <Hydrate><p>child</p></Hydrate>
}`,
    ),
  ).rejects.toThrow('the case code the page requested once it hydrated')
})

test('a boundary whose split code does not load fails the check', async () => {
  // The gate never opens: nothing is requested.
  await expect(
    expectClientRendersLikeServer(
      await hosts(),
      `import { Hydrate } from '@tanstack/react-start'
import { never } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={never()}><p>child</p></Hydrate>
}`,
    ),
  ).rejects.toThrow('the case code the page requested once it hydrated')
})
