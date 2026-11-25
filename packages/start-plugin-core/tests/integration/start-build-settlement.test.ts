/**
 * `vite build --watch` of a Start app whose client rebuild fails: what the
 * server embeds of the client build follows the client output on disk. Each
 * row reads the document Start's server entry renders through the failure,
 * fetches the client files it names (their bytes on disk, as a static host
 * serves them) and calls a server fn the client calls; then the app is fixed
 * and the next builds publish the new pair (`./start-build-settlement-app`).
 *
 * Settlement design, step 0 (design-settlement.md rev 4, §2 "Vite
 * client-build record", §6). A failure in the build phase, and another plugin's
 * `writeBundle` failing: green on head; step 7 keeps them green.
 */
import { describe, expect, test } from 'vitest'
import {
  bytesOf,
  clientOnly,
  expectRecovered,
  failedRebuild,
  scripts,
  timeout,
  unresolvedImport,
} from './start-build-settlement-app'

describe('vite build --watch: a client rebuild that fails', () => {
  // The client's rebuild fails in its build phase (an import that does not
  // resolve): nothing is written, and the server keeps the previous client
  // build: its document names the previous files, still on disk, and the
  // previous client's call is answered.
  // Source: whole-PR review S4-02 (V-41 through Start's own watch flow).
  test(
    'a failed transform: the document names the previous client files, and the previous call answers',
    async () => {
      const { first, during, after, build } = await failedRebuild(
        unresolvedImport,
        null,
        (now, before) => JSON.stringify(now) === JSON.stringify(before),
      )
      expect(Object.keys(first.named).length).toBeGreaterThan(0)
      expect(during).toEqual(first)
      expectRecovered(after, build)
    },
    timeout,
  )

  // Another plugin's `writeBundle` fails after the client's files are
  // written: the previous files are gone, and the document names the new
  // ones, with their bytes on disk (as on head, whose client build is
  // published before the failure).
  // Source: Astra's re-check of the settlement design (rev 3), finding 1.
  test(
    "another plugin's writeBundle fails: the document names the new client files, on disk",
    async () => {
      const { during, after, build } = await failedRebuild(
        { 'src/client-only.ts': clientOnly('MARK_EDIT') },
        'writeBundle',
        (now) =>
          scripts(now).count > 0 &&
          scripts(now).missing.length === 0 &&
          bytesOf(now).some((code) => code?.includes('MARK_EDIT')),
      )
      expect(scripts(during).count).toBeGreaterThan(0)
      expect(scripts(during).missing).toEqual([])
      expect(bytesOf(during).some((code) => code?.includes('MARK_EDIT'))).toBe(
        true,
      )
      expectRecovered(after, build)
    },
    timeout,
  )
})
