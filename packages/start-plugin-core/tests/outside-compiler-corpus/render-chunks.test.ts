/**
 * Not part of the compiler test corpus: harness controls of `render.ts`
 * (`expectRenderedThroughChunks`, per-gate `renderClient`), which check the
 * oracle, not the compiler. FINAL-PASS #9.
 */
import { expect, test } from 'vitest'
import {
  expectRenderedThroughChunks,
  renderClient,
  useHydrateHost,
} from '../render'

const hosts = useHydrateHost()

// A page without split code that requests only a dependency once it
// hydrated: what it requested is not the case's code, so the check fails
// (the former check passed on any request).
test('a dependency requested after hydration is not split code', async () => {
  const client = await renderClient(
    await hosts(),
    `import { useEffect } from 'react'
export function Page() {
  useEffect(() => {
    void import('react-dom/server').catch(() => {})
  }, [])
  return <p>no boundary</p>
}`,
  )
  expect(client.lazyUrls).not.toEqual([])
  expect(client.chunks).toEqual([])
  expect(() => expectRenderedThroughChunks(client)).toThrow()
})

// The split code of a boundary is the case's code, whatever its id.
test('the split code of a boundary is the case code', async () => {
  const client = await renderClient(
    await hosts(),
    `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={load()}><p>split</p></Hydrate>
}`,
  )
  expectRenderedThroughChunks(client)
})

// FINAL-PASS #47: code served with an empty map is the case's own only when
// the case module's own graph imports it. Here the page renders a component
// of another directory whose text-only boundary is split (its chunk is
// served with an empty map): split code, but not the case's (the former
// rule walked through any app module).
test("code served with an empty map that a module of another directory imports is not the case's split code", async () => {
  const other = await (
    await hosts()
  ).start.case({
    'widget.tsx': `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Widget() {
  return <Hydrate when={load()}>MARK_OTHER_TEXT</Hydrate>
}
`,
  })
  const client = await renderClient(
    await hosts(),
    `import { Widget } from '/${other.dir}/widget.tsx'
export function Page() {
  return <Widget />
}`,
  )
  expect(client.html).toContain('MARK_OTHER_TEXT')
  expect(client.lazyUrls.some((url) => url.includes(other.dir))).toBe(true)
  expect(client.chunks).toEqual([])
  expect(() => expectRenderedThroughChunks(client)).toThrow()
})

// FINAL-PASS #47: a module the dev server fails to serve (here, a syntax
// error) is not split code, even where the case module imports it.
test('a module the dev server fails to serve is not split code', async () => {
  const client = await renderClient(
    await hosts(),
    `import { useEffect } from 'react'
export function Page() {
  useEffect(() => {
    void import('./broken').catch(() => {})
  }, [])
  return <p>no boundary</p>
}`,
    { files: { './broken': `export const broken = (\n` } },
  )
  expect(client.lazyUrls.some((url) => url.includes('broken'))).toBe(true)
  expect(client.chunks).toEqual([])
  expect(() => expectRenderedThroughChunks(client)).toThrow()
})

// Per-gate control: a boundary whose gate the run leaves shut keeps its
// children's code unrequested.
test('gates opens only the gates it names', async () => {
  const code = `import { Hydrate } from '@tanstack/react-start'
import { interaction } from '@tanstack/react-start/hydration'
import { A } from './a'
import { B } from './b'
export function Page() {
  return <><Hydrate when={interaction()}><A /></Hydrate><Hydrate when={interaction()}><B /></Hydrate></>
}`
  const files = {
    './a': `export const A = () => <i>first</i>`,
    './b': `export const B = () => <b>second</b>`,
  }
  const none = await renderClient(await hosts(), code, {
    files,
    gates: 'none',
  })
  expect(none.lazy).not.toContain('./a')
  expect(none.lazy).not.toContain('./b')
  const all = await renderClient(await hosts(), code, { files })
  expect(all.lazy).toContain('./a')
  expect(all.lazy).toContain('./b')
})
