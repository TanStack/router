/**
 * Controls of the known-bug pins (pins-setup.ts): a pin passes when one of
 * its assertions fails, and fails when it fails otherwise (a timeout, an
 * error of the harness), which would else pass as the bug. Pins run in a
 * Vitest of their own, in a child Node process, with the setup file of the
 * compiler test projects.
 */
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { createAppDirectory } from '../src/app-directory'
import { runNodeProgram } from '../src/run-node'

const packageDirectory = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
)
const setupFile = path.join(packageDirectory, 'src/pins-setup.ts')

/** Runs `pins` (a test file's code) in a Vitest of its own; each test's state. */
async function runPinsFile(pins: string, env: NodeJS.ProcessEnv = {}) {
  const root = await createAppDirectory(packageDirectory, '.pins-')
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'pins.test.ts'), pins)
  const { stdout } = await runNodeProgram(
    `import { startVitest } from 'vitest/node'
const vitest = await startVitest('test', [], {
  root: ${JSON.stringify(root)},
  config: false,
  watch: false,
  reporters: [],
  setupFiles: [${JSON.stringify(setupFile)}],
})
const states = {}
for (const file of vitest.state.getFiles()) {
  for (const task of file.tasks) {
    states[task.name] = task.result?.state
  }
}
await vitest.close()
process.stdout.write('\\n' + JSON.stringify(states))
process.exit(0)
`,
    { cwd: root, env: { ...process.env, ...env }, timeout: 60_000 },
  )
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as Record<string, string>
}

const pins = `import { expect, onTestFinished, test } from 'vitest'
test.fails('an assertion fails', () => {
  expect(1).toBe(2)
})
test.fails('a polled assertion fails', async () => {
  await expect.poll(() => 1, { timeout: 50, interval: 10 }).toBe(2)
})
test.fails('a soft assertion fails', () => {
  expect.soft(1).toBe(2)
})
test.fails('an assertion fails, then a cleanup throws', () => {
  onTestFinished(() => {
    throw new Error('cleanup')
  })
  expect(1).toBe(2)
})
test.fails('the harness throws', () => {
  throw new Error('harness')
})
test.fails('a cleanup throws', () => {
  onTestFinished(() => {
    throw new Error('cleanup')
  })
})
test.fails('the test times out', () => new Promise(() => {}), 50)
test.fails('nothing fails', () => {})
`

test('a pin passes only when an assertion of it fails', async () => {
  expect(await runPinsFile(pins)).toEqual({
    'an assertion fails': 'pass',
    'a polled assertion fails': 'pass',
    'a soft assertion fails': 'pass',
    'an assertion fails, then a cleanup throws': 'pass',
    'the harness throws': 'fail',
    'a cleanup throws': 'fail',
    'the test times out': 'fail',
    'nothing fails': 'fail',
  })
}, 60_000)

test('with COMPILER_TESTS_PINS=run, pins are ordinary tests', async () => {
  expect(await runPinsFile(pins, { COMPILER_TESTS_PINS: 'run' })).toMatchObject(
    {
      'an assertion fails': 'fail',
      'the harness throws': 'fail',
      'the test times out': 'fail',
      'nothing fails': 'pass',
    },
  )
}, 60_000)
