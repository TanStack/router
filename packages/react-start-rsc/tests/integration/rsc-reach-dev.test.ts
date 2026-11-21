/**
 * The server-fn reach gate (`rsc-reach-app.ts`) on a Vite dev server with
 * RSC: every button clicked after a fresh start, after a restart (`vite
 * dev` restarting in place, as on a config edit) and after a real edit of
 * every server fn; each click answers 200 and shows its server fn's value
 * (SPEC J4.2: a server fn the client calls is callable by id).
 * Source: RSC investigation (Astra, 11-19: reach outcomes depend on the
 * host, the restart history and the persistent cache).
 */
import { afterAll, beforeAll, describe, test } from 'vitest'
import { startRscDevServer } from './rsc-app'
import {
  clickEveryButton,
  counterTest,
  editedReach,
  expectAnswer,
  reachFiles,
  reachPositions,
} from './rsc-reach-app'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { ClickOutcome } from './rsc-reach-app'

const timeout = 60_000

let server: DevServer
beforeAll(async () => {
  server = await startRscDevServer({
    browser: true,
    // (the server lives across this file's tests)
    registerCleanup: () => {},
    files: reachFiles,
  })
}, timeout)
afterAll(async () => {
  // (none when the start failed)
  await (server as DevServer | undefined)?.close()
})

describe('Vite dev with RSC, a fresh start', () => {
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

describe('Vite dev with RSC, after a restart', () => {
  let outcomes: Record<string, ClickOutcome | Error>
  beforeAll(async () => {
    await server.vite.restart()
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

describe('Vite dev with RSC, after an edit of every server fn', () => {
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
