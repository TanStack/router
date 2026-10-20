/**
 * Shared test helper: the app of the route tree determinism tests
 * (determinism.test.ts, outside-compiler-corpus/tree-bytes.test.ts), and
 * the variation of the order the filesystem lists its files in.
 *
 * (The listing order is varied at the filesystem boundary: writing the files
 * in another order does not change it on tmpfs, which lists by name, nor on
 * ext4, which lists by hash. Another process gives no other input: the
 * generator's output depends on no randomness or process state the tests
 * could vary.)
 */
import fsp, { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { onTestFinished, vi } from 'vitest'
import { fileRoute, lazyFileRoute, rootRoute } from './app'

/**
 * Route files whose routes tie on everything but their names (siblings of
 * the same depth and kind), with index routes, layouts, lazy files and
 * params.
 */
export const files: Record<string, string> = {
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
export async function appRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-determinism-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

/** Writes the app's route files at `root`, anew. */
export async function writeApp(root: string) {
  await rm(path.join(root, 'src'), { recursive: true, force: true })
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
}

/** The listing orders the tests vary. */
export const listingOrders = ['given', 'reversed', 'rotated'] as const

/**
 * Runs `run` while the filesystem lists directories in `order`:
 * `fs.promises.readdir` returns the real entries, permuted (any order is a
 * valid listing; filesystems differ: tmpfs lists by name, ext4 by hash).
 */
export async function withListingOrder<T>(
  order: (typeof listingOrders)[number],
  run: () => Promise<T>,
) {
  const permute = <TEntry>(entries: Array<TEntry>) =>
    order === 'reversed'
      ? [...entries].reverse()
      : order === 'rotated'
        ? [...entries.slice(1), ...entries.slice(0, 1)]
        : entries
  const readdir = fsp.readdir
  const listed = async (...args: Array<any>) =>
    permute(
      await (readdir as (...args: Array<any>) => Promise<Array<any>>)(...args),
    )
  const spy = vi
    .spyOn(fsp, 'readdir')
    .mockImplementation(listed as unknown as typeof readdir)
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
