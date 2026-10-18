/**
 * Not part of the compiler test corpus (an implementation test): how the
 * generator suppresses unchanged writes, which package AGENTS.md asks to
 * preserve (it avoids watcher loops). SPEC J1.10 leaves the mechanism free;
 * its outcome (generation settles, no reload loop, an edit hot-updates) is
 * tested on a real dev server in router-plugin
 * `tests/integration/{dev-server,rsbuild-dev-server}-generator.test.ts`.
 */
import { stat, utimes } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { Generator } from '../../src'
import { configOf, createApp, fileRoute, rootRoute } from '../app'

test('a new generator on an up-to-date app does not rewrite the route tree', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/index.tsx': fileRoute('/'),
  })
  const config = configOf(root)
  await new Generator({ config, root }).run()
  const past = new Date('2020-01-01T00:00:00Z')
  await utimes(config.generatedRouteTree, past, past)

  await new Generator({ config, root }).run()

  expect((await stat(config.generatedRouteTree)).mtimeMs).toBe(past.getTime())
})
