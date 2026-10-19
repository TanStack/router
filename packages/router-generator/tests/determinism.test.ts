/**
 * The route tree is deterministic (SPEC J1.5, G4): for the same app and
 * configuration, the order in which the filesystem lists the route files
 * and the working directory change neither the tree the generator writes
 * nor the routes the real router builds from it (route-tree.ts). Only
 * incidental order varies here (ctu `expectDeterministic`); how siblings
 * are sorted is free.
 *
 * (The listing order is varied at the filesystem boundary: writing the files
 * in another order does not change it on tmpfs, which lists by name, nor on
 * ext4, which lists by hash. Another process gives no other input: the
 * generator's output depends on no randomness or process state the tests
 * could vary.)
 */
import fsp, { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, onTestFinished, test, vi } from 'vitest'
import { expectDeterministic } from '@tanstack/compiler-test-utils/determinism'
import { configOf, fileRoute, lazyFileRoute, rootRoute } from './app'
import { observeRouteTree } from './route-tree'
import { Generator } from '../src'

/**
 * Route files whose routes tie on everything but their names (siblings of
 * the same depth and kind), with index routes, layouts, lazy files and
 * params.
 */
const files: Record<string, string> = {
  'src/routes/__root.tsx': rootRoute(),
  'src/routes/index.tsx': fileRoute('/wrong'),
  'src/routes/about.tsx': fileRoute('/wrong'),
  'src/routes/posts.tsx': fileRoute('/wrong'),
  'src/routes/posts/index.tsx': fileRoute('/wrong'),
  'src/routes/posts/$postId.tsx': fileRoute('/wrong'),
  'src/routes/posts/$postId.lazy.tsx': lazyFileRoute('/wrong'),
  'src/routes/account/busy-guard.tsx': fileRoute('/wrong'),
  'src/routes/account/beta-features.tsx': fileRoute('/wrong'),
  'src/routes/account/alpha.tsx': fileRoute('/wrong'),
  'src/routes/_auth.tsx': fileRoute('/wrong'),
  'src/routes/_auth/login.tsx': fileRoute('/wrong'),
  'src/routes/_auth/signup.tsx': fileRoute('/wrong'),
  'src/routes/(marketing)/pricing.tsx': fileRoute('/wrong'),
  'src/routes/(marketing)/features.tsx': fileRoute('/wrong'),
}

/** An app directory removed when the test finishes. */
async function appRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-determinism-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

/**
 * Writes the app's route files at `root` (anew), runs a new generator, and
 * returns the tree it wrote and the routes the router builds from it.
 */
async function generateFresh(root: string) {
  await rm(path.join(root, 'src'), { recursive: true, force: true })
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  const config = configOf(root)
  await new Generator({ config, root }).run()
  return {
    tree: await readFile(config.generatedRouteTree, 'utf8'),
    routes: await observeRouteTree(config.generatedRouteTree),
  }
}

/**
 * Runs `run` while the filesystem lists directories in another order:
 * `fs.promises.readdir` returns the real entries, permuted by `order` (any
 * order is a valid listing; filesystems differ: tmpfs lists by name, ext4 by
 * hash).
 */
async function withListingOrder<T>(
  order: <E>(entries: Array<E>) => Array<E>,
  run: () => Promise<T>,
) {
  const readdir = fsp.readdir
  const spy = vi
    .spyOn(fsp, 'readdir')
    .mockImplementation(async (...args: Parameters<typeof readdir>) =>
      order((await readdir(...args)) as Array<unknown>),
    )
  // (`import * as fsp from 'node:fs/promises'` sees the change only once
  // the module's ES exports are synced with its object)
  syncBuiltinESMExports()
  try {
    return await run()
  } finally {
    spy.mockRestore()
    syncBuiltinESMExports()
  }
}

describe('route tree determinism', () => {
  test('the order the filesystem lists the route files in changes neither the route tree nor the routes', async () => {
    const root = await appRoot()
    await expectDeterministic(
      ['given', 'reversed', 'rotated'] as const,
      (order) =>
        withListingOrder(
          (entries) =>
            order === 'reversed'
              ? [...entries].reverse()
              : order === 'rotated'
                ? [...entries.slice(1), ...entries.slice(0, 1)]
                : entries,
          () => generateFresh(root),
        ),
    )
  })

  test('the working directory changes neither the route tree nor the routes', async () => {
    const root = await appRoot()
    const cwd = process.cwd()
    onTestFinished(() => process.chdir(cwd))
    await expectDeterministic(
      [root, path.join(root, 'other'), tmpdir()],
      async (directory) => {
        await mkdir(directory, { recursive: true })
        process.chdir(directory)
        try {
          return await generateFresh(root)
        } finally {
          process.chdir(cwd)
        }
      },
    )
  })
})
