/**
 * The server-fn reach gate (`rsc-reach-app.ts`) on an Rsbuild dev server
 * with RSC and no persistent cache (`performance.buildCache: false`; with
 * it: rsc-reach-dev-rsbuild.test.ts): every button clicked after a fresh
 * start, after a restart (`rsbuild dev` run again; the route tree is up to
 * date when its first compile runs) and after a real edit of every server
 * fn; each click answers 200 and shows its server fn's value (SPEC J4.2: a
 * server fn the client calls is callable by id).
 * Source: RSC investigation (Astra, 11-19: outcomes of the two graphs
 * depend on the start history and the persistent cache, in opposite ways).
 */
import { afterAll, beforeAll, describe, test } from 'vitest'
import { startRscRsbuildDevServer } from './rsc-app'
import {
  clickEveryButton,
  counterTest,
  editedReach,
  expectAnswer,
  reachFiles,
  reachPositions,
} from './rsc-reach-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import type { ClickOutcome } from './rsc-reach-app'

const timeout = 60_000

let server: RsbuildDevServer
beforeAll(async () => {
  server = await startRscRsbuildDevServer({
    browser: true,
    // (the server lives across this file's tests)
    registerCleanup: () => {},
    config: { performance: { buildCache: false } },
    files: reachFiles,
  })
}, timeout)
afterAll(async () => {
  // (none when the start failed)
  await (server as RsbuildDevServer | undefined)?.close()
})

describe('Rsbuild dev with RSC, no cache, a fresh start', () => {
  let outcomes: Record<string, ClickOutcome | Error>
  beforeAll(async () => {
    outcomes = await clickEveryButton(server)
  }, timeout)
  test.for(reachPositions)(
    'a server fn only $position of a $where imports answers',
    ({ name }) => {
      expectAnswer(outcomes, name)
    },
  )
  test(counterTest, () => {
    expectAnswer(outcomes, 'counter')
  })
})

// SPEC J4.2: a server fn the client calls is callable by id, whatever the
// start history: a restart whose route tree is up to date answers too (the
// server compilation's last settlement run builds the resolver again once
// the client compiled, from what it calls; db260cf3a3 and 0a261a0259
// answered "Server function info not found").
describe('Rsbuild dev with RSC, no cache, after a restart', () => {
  let outcomes: Record<string, ClickOutcome | Error>
  beforeAll(async () => {
    server = await server.restart()
    outcomes = await clickEveryButton(server)
  }, timeout)
  test.for(reachPositions)(
    'a server fn only $position of a $where imports answers',
    ({ name }) => {
      expectAnswer(outcomes, name)
    },
  )
  test(counterTest, () => {
    expectAnswer(outcomes, 'counter')
  })
})

describe('Rsbuild dev with RSC, no cache, after an edit of every server fn', () => {
  let outcomes: Record<string, ClickOutcome | Error>
  beforeAll(async () => {
    await server.edit(editedReach())
    outcomes = await clickEveryButton(server)
  }, timeout)
  test.for(reachPositions)(
    'a server fn only $position of a $where imports answers with the edited value',
    ({ name }) => {
      expectAnswer(outcomes, name, true)
    },
  )
  test(`${counterTest}, with the edited value`, () => {
    expectAnswer(outcomes, 'counter', true)
  })
})
