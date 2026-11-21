/**
 * The type tests of the `nested` fixture (`generator/nested/tests.test-d.ts`,
 * SPEC J1.13): what its route tree types for links, navigation, redirects
 * and hooks of the real router, and the file route types router-core infers
 * from the tree. Checked by the real TypeScript compiler on a copy of the
 * fixture, where the tree is generated.
 */
import path from 'node:path'
import { expect, test } from 'vitest'
import { Generator } from '../../src'
import { copyFixture, fixtureConfig } from '../generator-fixture'
import { typeErrorsOfModules } from '../type-check'

test('the "nested" route tree types the router APIs of its type tests', async () => {
  const dir = await copyFixture('nested')
  // (temporary files on the copy's filesystem)
  const config = {
    ...fixtureConfig('nested', dir),
    tmpDir: path.join(dir, 'tmp'),
  }
  await new Generator({ config, root: dir }).run()
  const typeTests = path.join(dir, 'tests.test-d.ts')
  expect(typeErrorsOfModules([typeTests]).get(typeTests)).toEqual([])
})
