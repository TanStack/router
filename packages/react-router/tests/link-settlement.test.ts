import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

// A custom adapter can retain a route-owned subscription after its route
// leaves. Deferred reconciliation must not turn subscriber failures into load
// failures. Isolate the expected unhandled rejection from Vitest's own process.
test.each([
  ['subscriber-error', null, ['subscriber failed']],
  ['transaction-error', 'transaction failed', []],
  ['both-errors', 'transaction failed', ['subscriber failed']],
  ['publication-error', 'publication failed', []],
] as const)(
  'deferred Link reconciliation preserves error ownership: %s',
  (mode, navigationError, unhandled) => {
    const child = runProbe(mode)
    expect(child).toEqual({
      href: '/target?marker=after',
      notifications: 1,
      navigationError,
      unhandled,
    })
  },
)

test.each([
  ['reentry', 2],
  ['prepare-reentry', 1],
] as const)(
  'deferred Link reconciliation retains the successor source: %s',
  (mode, notifications) => {
    expect(runProbe(mode)).toEqual({
      href: '/target?marker=successor',
      notifications,
      navigationError: null,
      unhandled: [],
    })
  },
)

function runProbe(mode: string) {
  const child = spawnSync(
    process.execPath,
    [resolve(__dirname, 'fixtures/link-settlement.mjs')],
    {
      env: { ...process.env, NODE_ENV: 'test', LINK_SETTLEMENT_CASE: mode },
      encoding: 'utf8',
      timeout: 10_000,
    },
  )
  expect(child.error).toBeUndefined()
  expect(child.status, child.stderr).toBe(0)
  return JSON.parse(child.stdout.trim())
}
