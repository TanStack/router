/**
 * Vitest global setup: this run's directory in the system's temporary
 * directory, removed when the run ends, with what a test run writes outside
 * its test files' own temporary directories:
 * - the test apps (`./app-directory`; also what a tool still writes into an
 *   app after the test removed it);
 * - the route generator's temporary files (`TSR_TMP_DIR`, the generator's
 *   documented environment variable; a test that gives the generator a
 *   `tmpDir` of its own keeps it). On the apps' filesystem: the generator
 *   renames them into the app, which fails across filesystems (SPEC J1.16:
 *   a pinned bug). Not the generator's default
 *   (`.tanstack/tmp` in the working directory: the package's own directory).
 * - Node's compile cache (`NODE_COMPILE_CACHE`): on for the test workers
 *   and every Node process they start (dev servers, builds, `./run-node`),
 *   and where Vite's and Rsbuild's bins put it (`module.enableCompileCache()`
 *   without a directory). Its entries are per compiled file, and the apps of
 *   a run are new files: in the shared default
 *   (`<tmpdir>/node-compile-cache`) every run would add to it for good.
 *
 * The run directory is the native real path (Windows: long names, not the
 * 8.3 short names `os.tmpdir()` can return, so that paths the tools report
 * for files in it compare equal to paths built from it).
 *
 * The test processes inherit the directories through their environment
 * (`runDirectoryVariable`). Without this setup, the apps go to the system's
 * temporary directory itself.
 *
 * The compiler's self-checks (`TSR_COMPILER_VERIFY`, see
 * `router-utils/src/compiler/self-checks.ts`) are on for every test run
 * unless the environment says otherwise: every compile of the suite
 * re-parses its outputs, and a broken output or a violated compiler
 * invariant fails it loudly (users' runs only get a warning).
 *
 * The compiler's stats knob (`TSR_COMPILER_STATS`) is on too: each test file
 * ends with a check of the compilers' stale counts (`./test-scope-setup`).
 */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** The environment variable that names this run's directory. */
export const runDirectoryVariable = 'TANSTACK_COMPILER_TESTS_RUN_DIR'

/**
 * Where a test puts its temporary directories: this run's directory, or
 * without this setup the system's temporary directory.
 */
export function runDirectory(): string {
  return process.env[runDirectoryVariable] ?? os.tmpdir()
}

export default function setup() {
  const dir = mkdtempSync(
    path.join(realpathSync.native(os.tmpdir()), 'tanstack-compiler-tests-'),
  )
  const variables = {
    [runDirectoryVariable]: dir,
    TSR_TMP_DIR: path.join(dir, 'generator'),
    NODE_COMPILE_CACHE: path.join(dir, 'node-compile-cache'),
    TSR_COMPILER_VERIFY: process.env.TSR_COMPILER_VERIFY ?? '1',
    TSR_COMPILER_STATS: process.env.TSR_COMPILER_STATS ?? '1',
  }
  const previous = Object.fromEntries(
    Object.keys(variables).map((name) => [name, process.env[name]]),
  )
  Object.assign(process.env, variables)
  // Best effort: at the teardown, workers still running write their compile
  // cache into the directory, and on macOS and Windows removing it then
  // fails (ENOTEMPTY). That is not the run's failure: the removal at exit,
  // once every worker is gone, gets what is left.
  const remove = () => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
    } catch {}
  }
  // Vitest stops its workers after the global teardown, and a stopped
  // worker writes its compile cache: the directory goes again once they
  // all exited, when this process exits
  process.once('exit', remove)
  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
    remove()
  }
}
