/**
 * Vitest global setup: the route generator's temporary directory (its
 * `tmpDir`) for the harness builds of this run (build-harness.ts), removed
 * when the run ends.
 *
 * Not the generator's default (`.tanstack/tmp` in the working directory,
 * shared by every run, where its leftovers stayed), and not in the app:
 * Vite runs the plugins' `configResolved` hooks concurrently, so a build
 * that fails while the generator's hook still runs (the plugin-order rows
 * of integration/code-splitter-pragmas.test.ts) returns before the
 * generator's last write, and a write into the app while `dispose()`
 * removes it fails the removal (ENOTEMPTY). On the app's filesystem, under
 * this package's (ignored) `.tanstack`: the generator renames its
 * temporary files into the app.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    generatorTmpDir: string
  }
}

export default function setup(project: TestProject) {
  const parent = fileURLToPath(new URL('../.tanstack', import.meta.url))
  mkdirSync(parent, { recursive: true })
  const dir = mkdtempSync(path.join(parent, 'build-harness-'))
  project.provide('generatorTmpDir', dir)
  return () => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
}
