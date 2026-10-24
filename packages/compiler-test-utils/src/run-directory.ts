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
 *
 * The test processes inherit the directories through their environment
 * (`runDirectoryVariable`). Without this setup, the apps go to the system's
 * temporary directory itself.
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
    path.join(realpathSync(os.tmpdir()), 'tanstack-compiler-tests-'),
  )
  const variables = {
    [runDirectoryVariable]: dir,
    TSR_TMP_DIR: path.join(dir, 'generator'),
  }
  const previous = Object.fromEntries(
    Object.keys(variables).map((name) => [name, process.env[name]]),
  )
  Object.assign(process.env, variables)
  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
}
