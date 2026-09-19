import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'vite'
import { afterAll, beforeAll, expect, it } from 'vitest'

const exec = promisify(execFile)
let directory: string

beforeAll(async () => {
  directory = await mkdtemp(resolve(import.meta.dirname, '../.prerender-test-'))
  await build({
    configFile: resolve(import.meta.dirname, '../vite.config.ts'),
    logLevel: 'silent',
    build: {
      outDir: join(directory, 'compiled'),
    },
  })
}, 30_000)

afterAll(async () => {
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

it.each([
  { id: 'success', scenario: 'success', execArgv: [] },
  { id: 'invalid-page', scenario: 'invalid-page', execArgv: [] },
  { id: 'startup-error', scenario: 'startup-error', execArgv: [] },
  {
    id: 'input-type-inline',
    scenario: 'success',
    execArgv: [
      '--input-type=module',
      '--eval',
      'await import(process.argv[1])',
    ],
  },
  {
    id: 'input-type-separated',
    scenario: 'success',
    execArgv: [
      '--input-type',
      'module',
      '--eval',
      'await import(process.argv[1])',
    ],
  },
  {
    id: 'input-type-with-v8-option',
    scenario: 'success',
    execArgv: [
      '--max-old-space-size=512',
      '--input-type=module',
      '--eval',
      'await import(process.argv[1])',
    ],
  },
])(
  'releases preview resources and lets the caller exit: $id',
  async ({ id, scenario, execArgv }) => {
    const { stdout } = await exec(
      process.execPath,
      [
        ...execArgv,
        resolve(import.meta.dirname, 'fixtures/prerender-worker/driver.mjs'),
        join(directory, 'compiled/esm/vite/prerender.js'),
        join(directory, id),
        scenario,
      ],
      { timeout: 10_000 },
    )
    expect(stdout).toContain(`Caller completed: ${scenario}`)
  },
  15_000,
)
