/**
 * Vitest `setupFiles` entry of the compiler test projects. Setup files run
 * once per test file, also when the worker keeps its modules across files
 * (`isolate: false`), so every file gets both:
 *
 * - every test runs inside its own scope (`./test-scope`), so that helpers
 *   find the test their work belongs to when the tests of a file run
 *   concurrently;
 * - the process environment (and working directory) is the one the file
 *   started with again once
 *   the file's tests ended: tools change it as they run (`vite build` sets
 *   `NODE_ENV=production` when it is unset, and a later dev server of the
 *   same process would then serve production code without React Refresh's
 *   page preamble), so with modules kept across files a file would see what
 *   an earlier file's tools left there;
 * - what the file's tests shared (`onFileFinished` of `./test-scope`, e.g.
 *   the run pages of `./browser`) is released once its tests ended, after
 *   the file's own `afterAll` hooks (they ran first: hooks after the tests
 *   run in reverse order, and this file registers its hooks first).
 */
import { afterAll, aroundEach } from 'vitest'
import { runFileCleanups, runInTestScope } from './test-scope'

aroundEach(async (runTest, context) => {
  await runInTestScope(context, runTest)
})

const environment = { ...process.env }
const cwd = process.cwd()
afterAll(async () => {
  try {
    await runFileCleanups()
  } finally {
    process.chdir(cwd)
    for (const name of Object.keys(process.env)) {
      if (!(name in environment)) {
        delete process.env[name]
      }
    }
    Object.assign(process.env, environment)
  }
})
