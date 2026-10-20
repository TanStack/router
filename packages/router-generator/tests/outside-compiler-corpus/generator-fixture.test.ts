/**
 * Not part of the compiler test corpus: a harness control of
 * generator-fixture.ts (it checks the oracle, not the generator). A route
 * file left in the file-modification fixture by an earlier run, possibly of
 * an older harness (its route files are gitignored), would be one more
 * route of the fixture and fail generator.test.ts in that checkout only.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { copyFixture, prepareFixture } from '../generator-fixture'

it('prepareFixture removes the route files of earlier runs', async () => {
  const dir = await copyFixture('file-modification')
  const testRoutes = path.join(dir, 'routes', '(test)')
  // (a file of the old harness, which no longer writes it)
  await fs.writeFile(
    path.join(testRoutes, 'template-literal.tsx'),
    "import { createFileRoute } from '@tanstack/react-router'\n" +
      'export const Route = createFileRoute(`/foo/bar`)({})\n',
  )
  const before = await prepareFixture('file-modification', dir)
  expect((await fs.readdir(testRoutes)).sort()).toEqual(
    [
      '-keep-directory',
      ...Object.keys(before).map((file) => path.basename(file)),
    ].sort(),
  )
})
