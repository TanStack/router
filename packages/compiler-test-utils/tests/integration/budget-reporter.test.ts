/**
 * Controls of the budget reporter (budget-reporter.ts) on real Vitest runs
 * (the Vitest CLI in a child process, on a fixture package that has this
 * package's budgets): a run in which a test file failed to load is not a
 * measurement, so strict mode fails it as invalid and report-only mode says
 * its times are not a measurement; a run whose files all pass is a
 * measurement.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'

const reporter = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/budget-reporter.ts',
)
const vitestCli = path.join(
  path.dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
  'vitest.mjs',
)

const passingFile = `test('passes', () => {})\n`
// A file that fails to load, like a test importing a helper that is missing
const brokenFile = `import './missing-helper.js'\n\ntest('never runs', () => {})\n`

/**
 * Runs a whole tier (every file of the fixture) at the budgets' worker count
 * with the Vitest CLI; resolves with its exit code and output.
 */
async function runTier(
  files: Record<string, string>,
  budgets: 'strict' | 'report-only',
) {
  const root = await mkdtemp(path.join(tmpdir(), 'budget-reporter-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: '@tanstack/compiler-test-utils', type: 'module' }),
  )
  await writeFile(
    path.join(root, 'vitest.config.mjs'),
    `export default { test: { globals: true, watch: false, reporters: ['default', ${JSON.stringify(reporter)}] } }\n`,
  )
  for (const [name, code] of Object.entries(files)) {
    await writeFile(path.join(root, name), code)
  }
  // The child is a Vitest run of its own, not a worker of this one
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST')),
  )
  delete env.COMPILER_TEST_BUDGETS
  if (budgets === 'strict') {
    env.COMPILER_TEST_BUDGETS = 'strict'
  }
  env.NO_COLOR = '1'
  delete env.FORCE_COLOR
  return new Promise<{ exitCode: number; output: string }>((resolve) => {
    execFile(
      process.execPath,
      [vitestCli, 'run', '--root', root, '--maxWorkers=4'],
      { cwd: root, env, timeout: 25_000 },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error ? ((error.code as number | undefined) ?? 1) : 0,
          output: `${stdout}\n${stderr}`,
        })
      },
    )
  })
}

test.concurrent(
  'strict mode fails a run in which a test file failed to load, as an invalid measurement',
  async () => {
    const { exitCode, output } = await runTier(
      { 'passing.test.js': passingFile, 'broken.test.js': brokenFile },
      'strict',
    )
    expect(output).toContain('Test budget (strict')
    expect(output).toMatch(
      /Test budget \(strict\): not a valid measurement \(test files failed: broken\.test\.js\)/,
    )
    expect(output).not.toContain('Test budget (strict): passed')
    expect(exitCode).toBe(1)
  },
  30_000,
)

test.concurrent(
  'report-only mode says the times of such a run are not a measurement',
  async () => {
    const { output } = await runTier(
      { 'passing.test.js': passingFile, 'broken.test.js': brokenFile },
      'report-only',
    )
    expect(output).toContain('Test budget (report only')
    expect(output).toMatch(
      /not a measurement \(test files failed: broken\.test\.js\)/,
    )
  },
  30_000,
)

test.concurrent(
  'a run whose files all pass is a measurement',
  async () => {
    const { output } = await runTier(
      { 'passing.test.js': passingFile },
      'strict',
    )
    // The reporter ran and judged the time (pass or over a limit: the time
    // depends on the machine), without calling the run invalid
    expect(output).toContain('Test budget (strict')
    expect(output).toContain('@tanstack/compiler-test-utils unit:')
    expect(output).not.toContain('not a valid measurement')
  },
  30_000,
)
