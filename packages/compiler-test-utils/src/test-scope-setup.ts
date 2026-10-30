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
 *   an earlier file's tools left there.
 */
import { afterAll, aroundEach } from 'vitest'
import { runInTestScope } from './test-scope'

aroundEach(async (runTest, context) => {
  await runInTestScope(context, runTest)
})

const environment = { ...process.env }
const cwd = process.cwd()
afterAll(() => {
  process.chdir(cwd)
  for (const name of Object.keys(process.env)) {
    if (!(name in environment)) {
      delete process.env[name]
    }
  }
  Object.assign(process.env, environment)
})
