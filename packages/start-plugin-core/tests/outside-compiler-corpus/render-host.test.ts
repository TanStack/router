/**
 * Not part of the compiler test corpus: a harness control of render.ts, the
 * in-process client host of the `<Hydrate>` rows (it checks the oracle, not
 * the compiler). Like the Vite and Rsbuild hosts, it hands the plugin every
 * id its virtual module pattern matches, however the rest of the id is
 * spelled (a correct compiler may name its virtual modules after another
 * path than the parent's), and declines every other id the linker asks for.
 * Source: W4-hydrate-rsc H10.
 */
import { expect, test } from 'vitest'
import { compileHydrate, loadChunk, renderClient } from '../render'

const source = `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
export function Page() {
  return <Hydrate when={load()}><p>child</p></Hydrate>
}`

test('the client host loads a virtual module named after another path and declines unrelated ids', async () => {
  const compiled = await compileHydrate('client', source)
  expect(compiled.chunkIds).not.toEqual([])
  const reference = await renderClient(source, { compiled })
  // The same virtual modules under another path before the query.
  const relocated = new Map(
    compiled.chunkIds.map((id) => [
      id.replace(/^[^?]*/, '/elsewhere/relocated-module.tsx'),
      id,
    ]),
  )
  let parent = compiled.parent
  for (const [to, from] of relocated) {
    parent = parent.split(from).join(to)
  }
  parent += `\nexport const loadUnrelated = () => import('./unrelated-module')\n`
  const asked: Array<string> = []
  const client = await renderClient(source, {
    compiled: { parent, plugin: compiled.plugin },
    loadChunk: (id) => {
      asked.push(id)
      const original = relocated.get(id)
      return original === undefined
        ? null
        : loadChunk(compiled.plugin, 'client', original)
    },
  })
  expect(reference.html).toContain('<p>child</p>')
  expect(client.html).toBe(reference.html)
  expect(client.loadedChunks).toEqual(
    expect.arrayContaining([...relocated.keys()]),
  )
  // (`./unrelated-module` and its extension probes never reach the plugin)
  await expect(client.module.loadUnrelated()).rejects.toThrow()
  expect(asked.filter((id) => !relocated.has(id))).toEqual([])
})
