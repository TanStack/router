/**
 * `vite build --watch` of a Start app whose client rebuild fails: what the
 * server embeds of the client build follows the client output on disk. Each
 * row reads the document Start's server entry renders through the failure,
 * fetches the client files it names (their bytes on disk, as a static host
 * serves them) and calls a server fn the client calls; then the app is fixed
 * and the next builds publish the new pair (`./start-build-settlement-app`).
 *
 * Settlement design, step 0 (design-settlement.md rev 4, §2 "Vite
 * client-build record", §6). A failure in the build phase: green on head; step 7 keeps it
 * green. The output phase's failures: `start-build-settlement-output.test.ts`.
 */
import { describe, expect, test } from 'vitest'
import {
  expectRecovered,
  failedRebuild,
  unresolvedImport,
} from './start-build-settlement-app'

describe('vite build --watch: a client rebuild that fails', () => {
  // The client's rebuild fails in its build phase (an import that does not
  // resolve): nothing is written, no server build starts, and the server
  // keeps the previous client build: its document is the page and names the
  // previous files, still on disk, and the previous client's call is
  // answered.
  // Source: whole-PR review S4-02 (V-41 through Start's own watch flow);
  // Gemini's and Astra's reviews of settlement step 0.
  test('a failed transform: the document names the previous client files, and the previous call answers', async () => {
    const { first, during, after, build } = await failedRebuild(
      unresolvedImport,
      null,
    )
    expect(during).toEqual({ served: first, serverBuilds: 0 })
    expectRecovered(after, build)
  })
})
