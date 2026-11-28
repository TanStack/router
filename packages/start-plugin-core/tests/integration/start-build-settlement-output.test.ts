/**
 * `vite build --watch` of a Start app whose client rebuild fails: what the
 * server embeds of the client build follows the client output on disk. Each
 * row reads the document Start's server entry renders through the failure,
 * fetches the client files it names (their bytes on disk, as a static host
 * serves them) and calls a server fn the client calls; then the app is fixed
 * and the next builds publish the new pair (`./start-build-settlement-app`).
 *
 * Settlement design, step 0 (design-settlement.md rev 4, §2 "Vite
 * client-build record", §6; step 7). Failures of the output phase: another
 * plugin's `generateBundle` failing (the record withdrawn at `renderStart`)
 * and its `writeBundle` failing (the record committed at `writeBundle`,
 * before that plugin's handler).
 */
import { describe, expect, test } from 'vitest'
import {
  bytesOf,
  clientOnly,
  expectRecovered,
  failedRebuild,
  scripts,
  timeout,
} from './start-build-settlement-app'

describe('vite build --watch: a client rebuild that fails', () => {
  // Another plugin's `generateBundle` fails: Vite emptied the client's
  // output directory before rendering, and nothing is written. The server
  // renders the page naming no client file (none is on disk), and is rebuilt
  // once the client builds again.
  // Source: Fable's settlement design rev 4 (`hook/probe4.mjs`).
  test(
    "another plugin's generateBundle fails: the document names no client file",
    async () => {
      const { during, after, build } = await failedRebuild(
        { 'src/client-only.ts': clientOnly('MARK_EDIT') },
        'generateBundle',
      )
      // (the page, not an error page that names nothing)
      const { status, rendered, named } = during.served
      expect({ status, rendered, named }).toEqual({
        status: 200,
        rendered: true,
        named: {},
      })
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
      )
      const { served } = during
      expect([served.status, served.rendered]).toEqual([200, true])
      expect(scripts(served).count).toBeGreaterThan(0)
      expect(scripts(served).missing).toEqual([])
      expect(bytesOf(served).some((code) => code?.includes('MARK_EDIT'))).toBe(
        true,
      )
      expectRecovered(after, build)
    },
    timeout,
  )
})
