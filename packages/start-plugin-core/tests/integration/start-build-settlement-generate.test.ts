/**
 * `vite build --watch` of a Start app whose client rebuild fails: what the
 * server embeds of the client build follows the client output on disk. Each
 * row reads the document Start's server entry renders through the failure,
 * fetches the client files it names (their bytes on disk, as a static host
 * serves them) and calls a server fn the client calls; then the app is fixed
 * and the next builds publish the new pair (`./start-build-settlement-app`).
 *
 * Settlement design, step 0 (design-settlement.md rev 4, §2 "Vite
 * client-build record", §6). Another plugin's `generateBundle` failing, in a file of
 * its own (the pin waits out its outcome bound). A pin: step 7 (the record
 * withdrawn at `renderStart`) turns it green.
 */
import { describe, expect, test } from 'vitest'
import {
  clientOnly,
  expectRecovered,
  failedRebuild,
  timeout,
} from './start-build-settlement-app'

describe('vite build --watch: a client rebuild that fails', () => {
  // Another plugin's `generateBundle` fails: Vite emptied the client's
  // output directory before rendering, and nothing is written. The server
  // names no client file (none is on disk), and is rebuilt once the client
  // builds again.
  // Source: Fable's settlement design rev 4 (`hook/probe4.mjs`).
  test.fails(
    "another plugin's generateBundle fails: the document names no client file",
    async () => {
      const { during, after, build } = await failedRebuild(
        { 'src/client-only.ts': clientOnly('MARK_EDIT') },
        'generateBundle',
        (now) => Object.keys(now.named).length === 0,
      )
      expect(during.named).toEqual({})
      expectRecovered(after, build)
    },
    timeout,
  )
})
