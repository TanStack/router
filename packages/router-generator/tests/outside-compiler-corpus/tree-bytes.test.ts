/**
 * Not part of the compiler test corpus (an implementation control): the
 * current generator writes byte-identical route trees whatever the order
 * the filesystem lists the route files in and the working directory. SPEC
 * J1.5/G4 require deterministic routes (determinism.test.ts); the tree's
 * text (names, printing, comments) is free (§5.1, §5.5), so a correct
 * generator may fail this, e.g. with a generated comment naming its
 * working directory.
 */
import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, onTestFinished, test } from 'vitest'
import { expectDeterministic } from '@tanstack/compiler-test-utils/determinism'
import { Generator } from '../../src'
import { configOf } from '../app'
import {
  appRoot,
  listingOrders,
  withListingOrder,
  writeApp,
} from '../determinism-app'

/** Writes the app at `root` anew, generates, and returns the tree's text. */
async function treeOf(root: string) {
  await writeApp(root)
  const config = configOf(root)
  await new Generator({ config, root }).run()
  return readFile(config.generatedRouteTree, 'utf8')
}

describe('route tree bytes', () => {
  test('do not depend on the order the filesystem lists the route files in', async () => {
    const root = await appRoot()
    await expectDeterministic([...listingOrders], (order) =>
      withListingOrder(order, () => treeOf(root)),
    )
  })

  test('do not depend on the working directory', async () => {
    const root = await appRoot()
    const cwd = process.cwd()
    onTestFinished(() => process.chdir(cwd))
    await expectDeterministic(
      [root, path.join(root, 'other'), tmpdir()],
      async (directory) => {
        await mkdir(directory, { recursive: true })
        process.chdir(directory)
        try {
          return await treeOf(root)
        } finally {
          process.chdir(cwd)
        }
      },
    )
  })
})
