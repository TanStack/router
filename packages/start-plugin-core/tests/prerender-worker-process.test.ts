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

it.each(['success', 'invalid-page', 'startup-error'])(
  'releases preview resources after %s and lets the caller exit',
  async (scenario) => {
    const { stdout } = await exec(
      process.execPath,
      [
        resolve(import.meta.dirname, 'fixtures/prerender-worker/driver.mjs'),
        join(directory, 'compiled/esm/vite/prerender.js'),
        join(directory, scenario),
        scenario,
      ],
      { timeout: 10_000 },
    )
    expect(stdout).toContain(`Caller completed: ${scenario}`)
  },
  15_000,
)
