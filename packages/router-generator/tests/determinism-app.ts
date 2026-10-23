/**
 * The app of the route tree determinism tests (`determinism.test.ts`): its
 * route files, a fresh generation at a root, and listing orders of the
 * filesystem.
 */
import fsp, { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { onTestFinished, vi } from 'vitest'
import {
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  captureDiagnostics,
  expectNoProblems,
} from '@tanstack/compiler-test-utils/diagnostic-channel'
import { Generator } from '../src'
import { configOf, fileRoute, lazyFileRoute, rootRoute } from './app'
import { recordInputs } from './consumer-inputs'
import { observeRouteTree } from './route-tree'

/**
 * Route files whose routes tie on everything but their names (siblings of
 * the same depth and kind), with index routes, layouts, lazy files and
 * params.
 */
export const files: Record<string, string> = {
  'src/routes/__root.tsx': rootRoute(),
  // A required J1.12 diagnostic exercises semantic diagnostic determinism.
  'src/routes/helper.tsx': 'export const helper = 1',
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

/** The app's route files as the tree's directory (`src`) names them. */
const routeFiles = new Set(
  Object.keys(files).map((file) => path.posix.relative('src', file)),
)

/** An app directory removed when the test finishes. */
export async function appRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-determinism-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

/**
 * Writes the app's route files at `root` (anew), runs a new generator, and
 * returns the tree it wrote (`tree`, its bytes: for the implementation
 * control only), the routes the real router builds from it, and the
 * warnings and errors the generator logged.
 */
export async function generateFresh(root: string) {
  await rm(path.join(root, 'src'), { recursive: true, force: true })
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  recordInputs(root, files)
  const config = configOf(root, { disableLogging: false })
  const { diagnostics } = await captureDiagnostics(() =>
    new Generator({ config, root }).run(),
  )
  const diagnosticContract = {
    // (a warning: the run goes on, so no error)
    severity: 'warning' as const,
    file: 'src/routes/helper.tsx',
    root,
  }
  expectDiagnostic(diagnostics, diagnosticContract)
  const reported = findDiagnostics(diagnostics, diagnosticContract)
  expectNoProblems(
    diagnostics.filter((diagnostic) => !reported.includes(diagnostic)),
  )
  return {
    tree: await readFile(config.generatedRouteTree, 'utf8'),
    routes: await observeRouteTree(config.generatedRouteTree),
    // Compare the file reported, not wording, grouping, channel, severity
    // labels, or duplicate presentations of the same diagnosis.
    diagnostics: [{ file: diagnosticContract.file }],
  }
}

/**
 * What a generation means (SPEC J1.5, G4): each route's path, parent and
 * route file, the app's route files that load only with it, and the
 * warnings and errors of the generation. Not the tree's bytes or generated
 * names, nor generated support modules a route's load may evaluate.
 */
export function routeTreeSemantics({
  routes,
  diagnostics,
}: Awaited<ReturnType<typeof generateFresh>>) {
  return {
    routes: Object.fromEntries(
      Object.entries(routes).map(([id, route]) => [
        id,
        { ...route, lazy: route.lazy.filter((file) => routeFiles.has(file)) },
      ]),
    ),
    diagnostics,
  }
}

/**
 * Runs `run` while the filesystem lists directories in another order:
 * `fs.promises.readdir` returns the real entries, permuted by `order` (any
 * order is a valid listing; filesystems differ: tmpfs lists by name, ext4 by
 * hash).
 */
export async function withListingOrder<T>(
  order: <TEntry>(entries: Array<TEntry>) => Array<TEntry>,
  run: () => Promise<T>,
) {
  const readdir = fsp.readdir
  const listed = async (...args: Array<any>) =>
    order(
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

/** Valid listings of the same entries: as listed, reversed, rotated by one. */
export const listingOrders: Array<
  <TEntry>(entries: Array<TEntry>) => Array<TEntry>
> = [
  (entries) => entries,
  (entries) => [...entries].reverse(),
  (entries) => [...entries.slice(1), ...entries.slice(0, 1)],
]

/** The working directories a generation runs from (`root` is the app's). */
export const workingDirectories = (root: string) => [
  root,
  path.join(root, 'other'),
  tmpdir(),
]

/**
 * Runs `run` with `directory` (created if missing) as the working
 * directory, restoring the previous one afterwards.
 */
export async function inDirectory<T>(directory: string, run: () => Promise<T>) {
  const cwd = process.cwd()
  await mkdir(directory, { recursive: true })
  process.chdir(directory)
  try {
    return await run()
  } finally {
    process.chdir(cwd)
  }
}
