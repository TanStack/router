/**
 * The route tree is deterministic (SPEC J1.5, G4): for the same app and
 * configuration, the order in which the filesystem lists the route files
 * and the working directory change neither the routes the real router
 * builds from the tree (route-tree.ts) nor, for the listing order, the
 * generation's warnings and errors. Only incidental order varies here (ctu `expectDeterministic`);
 * what is compared is what the tree means (`routeTreeSemantics`): how the
 * tree is printed and how siblings are sorted is free. (The current
 * generator's byte-identical output is an implementation control:
 * `outside-compiler-corpus/route-tree-bytes.test.ts`.)
 *
 * (The listing order is varied at the filesystem boundary: writing the files
 * in another order does not change it on tmpfs, which lists by name, nor on
 * ext4, which lists by hash. Another process gives no other input: the
 * generator's output depends on no randomness or process state the tests
 * could vary.)
 */
import { describe, test } from 'vitest'
import { expectDeterministic } from '@tanstack/compiler-test-utils/determinism'
import {
  appRoot,
  generateFresh,
  inDirectory,
  listingOrders,
  routeTreeSemantics,
  withListingOrder,
  workingDirectories,
} from './determinism-app'

describe('route tree determinism', () => {
  test('the order the filesystem lists the route files in does not change the routes', async () => {
    const root = await appRoot()
    await expectDeterministic(
      listingOrders,
      (order) => withListingOrder(order, () => generateFresh(root)),
      { project: routeTreeSemantics },
    )
  })

  test('the working directory does not change the routes', async () => {
    const root = await appRoot()
    await expectDeterministic(
      workingDirectories(root),
      (directory) => inDirectory(directory, () => generateFresh(root)),
      // (the routes only: diagnostics may name files relative to the
      // working directory, §5.7)
      { project: (generation) => routeTreeSemantics(generation).routes },
    )
  })
})
