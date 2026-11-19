/**
 * `allowImport` answers across edits on a dev server (Vite and Rsbuild): an
 * importer it allows keeps the real module and one it does not keeps the
 * mock after edits, after the importer is removed and added again, and
 * after the callback would answer otherwise for the re-created import (the
 * answer is asked once per import for the session, and remembered:
 * guide/import-protection.md "The `allowImport` Callback").
 */
import { describe, expect, test } from 'vitest'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { settledAcrossTurn } from './hosts'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const timeout = 120_000

/** A use of the denied file: the real value's text, or `mock`. */
const importer = (label: string) => `import { secret } from './secret.server'
export const use = () => {
  const value: unknown = secret()
  return typeof value === 'string' && value.startsWith('MARK_') ? value : 'mock'
}
export const label = '${label}'
`

/** The entry: the uses of `src/allowed.ts` (when `withAllowed`) and `src/plain.ts`. */
const entry = (
  withAllowed: boolean,
) => `${withAllowed ? `import { use as allowed } from './allowed'\n` : ''}import { use as plain } from './plain'
;(globalThis as any).uses = { ${withAllowed ? 'allowed, ' : ''}plain }
`

const files = {
  'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
  'src/allowed.ts': importer('first'),
  'src/plain.ts': importer('first'),
  'src/entry.ts': entry(true),
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
}

const readScript = `const out = {}
for (const [name, use] of Object.entries(globalThis.uses)) {
  out[name] = use()
}
return out`

const edited = {
  'src/allowed.ts': importer('edited'),
  'src/plain.ts': importer('edited'),
}
const removed = { 'src/entry.ts': entry(false), 'src/allowed.ts': null }
const restored = {
  'src/allowed.ts': importer('restored'),
  'src/entry.ts': entry(true),
}

const expected = { allowed: 'MARK_SECRET', plain: 'mock' }

/** `allowImport` allowing `src/allowed.ts` and not `src/plain.ts` (the other way round after `flip`), each call recorded by importer. */
function answering() {
  let flipped = false
  const asked: Array<string> = []
  const importProtection: ImportProtectionOptions = {
    behavior: 'mock',
    mockAccess: 'off',
    allowImport: (info) => {
      const file = info.importer.split('?')[0]!.split('/').pop()!
      asked.push(file)
      return file === 'allowed.ts'
        ? !flipped
        : file === 'plain.ts'
          ? flipped
          : false
    },
  }
  return {
    importProtection,
    asked,
    flip: () => {
      flipped = true
    },
  }
}

describe.each(['vite', 'rsbuild'] as const)('%s dev', (bundler) => {
  // Source: perf pass item 14 (the ledger's reconciliation after each
  // compile asks only restored edge modules again).
  test(
    'allowImport answers hold after edits, a removed and re-added importer, and a callback that would answer otherwise',
    async () => {
      const { importProtection, asked, flip } = answering()
      let run: () => Promise<unknown>
      let edit: (changes: Record<string, string | null>) => Promise<void>
      if (bundler === 'vite') {
        const server = await startDevServer({
          browser: true,
          start: { importProtection },
          files,
        })
        run = async () =>
          (await runViteClient(server, '/src/router.ts', readScript)).result
        edit = async (changes) => {
          await server.edit(changes)
          await server.idle()
        }
      } else {
        const server = await startRsbuildStartDevServer({
          compileTimeout: timeout,
          browser: true,
          hmr: false,
          files,
          start: { importProtection },
        })
        run = async () =>
          ((await runInClient(server, readScript)) as { result: unknown })
            .result
        edit = async (changes) => {
          await settledAcrossTurn(server)
          await server.edit(changes)
          await settledAcrossTurn(server)
        }
      }
      const seen: Record<string, unknown> = { first: await run() }
      await edit(edited)
      seen.edited = await run()
      await edit(removed)
      seen.removed = await run()
      flip()
      await edit(restored)
      seen.restored = await run()
      expect(seen).toEqual({
        first: expected,
        edited: expected,
        removed: { plain: 'mock' },
        restored: expected,
      })
      // once per import for the session (the denied file compiled under its
      // own id once nothing allowed brings it is asked about itself)
      expect(
        asked.filter((file) => file !== 'secret.server.ts').sort(),
      ).toEqual(['allowed.ts', 'plain.ts'])
    },
    timeout,
  )
})
