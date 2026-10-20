/**
 * The route tree is deterministic (SPEC J1.5, G4): for the same app and
 * configuration, the order in which the filesystem lists the route files
 * and the working directory change neither the routes the real router
 * builds from the tree (route-tree.ts) nor the generator's diagnostics.
 * Only incidental order varies here (ctu `expectDeterministic`); how
 * siblings are sorted is free, and so is the tree's text (names, printing,
 * comments: §5.1, §5.5). Identical tree bytes are an implementation
 * control: outside-compiler-corpus/tree-bytes.test.ts.
 */
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, onTestFinished, test } from 'vitest'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { expectDeterministic } from '@tanstack/compiler-test-utils/determinism'
import { Generator } from '../src'
import { configOf } from './app'
import {
  appRoot,
  files,
  listingOrders,
  withListingOrder,
  writeApp,
} from './determinism-app'
import { observeRouteTree } from './route-tree'

/**
 * Writes the app's route files at `root` (anew), runs a new generator, and
 * returns what the app sees: the routes the router builds from the tree
 * (with the app's own files each route loads lazily; generated support
 * modules are free) and the generator's warnings and errors.
 */
async function generateFresh(root: string) {
  await writeApp(root)
  const config = configOf(root, { disableLogging: false })
  const { diagnostics } = await captureConsole(() =>
    new Generator({ config, root }).run(),
  )
  const routes = await observeRouteTree(config.generatedRouteTree)
  const appFiles = new Set(
    Object.keys(files).map((file) =>
      path
        .relative(
          path.dirname(config.generatedRouteTree),
          path.join(root, file),
        )
        .replaceAll(path.sep, '/'),
    ),
  )
  for (const route of Object.values(routes)) {
    route.lazy = route.lazy.filter((file) => appFiles.has(file))
  }
  return {
    routes,
    diagnostics: diagnostics
      .filter((diagnostic) => diagnostic.severity !== 'info')
      .map(({ severity, text }) => `${severity}: ${text}`)
      .sort(),
  }
}

describe('route tree determinism', () => {
  test('the order the filesystem lists the route files in changes neither the routes nor the diagnostics', async () => {
    const root = await appRoot()
    await expectDeterministic([...listingOrders], (order) =>
      withListingOrder(order, () => generateFresh(root)),
    )
  })

  test('the working directory does not change the routes', async () => {
    const root = await appRoot()
    const cwd = process.cwd()
    onTestFinished(() => process.chdir(cwd))
    await expectDeterministic(
      [root, path.join(root, 'other'), tmpdir()],
      async (directory) => {
        await mkdir(directory, { recursive: true })
        process.chdir(directory)
        try {
          // (diagnostics may name files relative to the working directory:
          // §5.7)
          return (await generateFresh(root)).routes
        } finally {
          process.chdir(cwd)
        }
      },
    )
  })
})
