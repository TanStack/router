/**
 * Pins: forms that reach a denied file's text past import protection, in a
 * Vite client build, mock mode (KNOWN-BUGS "Remaining pins"). Each emits the
 * text without a report.
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import { importersIn } from './v2-hosts'

const timeout = 60_000

const CANARY = 'CANARY_DENIED_TEXT'

const secrets = `export const s = '${CANARY}'\n`

async function emitsCanary(dir: string): Promise<boolean> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  for (const entry of entries) {
    if (
      entry.isFile() &&
      (
        await readFile(path.join(entry.parentPath, entry.name), 'latin1')
      ).includes(CANARY)
    ) {
      return true
    }
  }
  return false
}

test.fails.each<[string, string, Record<string, string>]>([
  [
    'a clean ?worker importing a denied file',
    `import W from './w.ts?worker'\nexport const m = new W()\n`,
    {
      'src/secrets.server.ts': secrets,
      'src/w.ts': `import { s } from './secrets.server'\npostMessage(s)\n`,
    },
  ],
  [
    'a denied file, new URL',
    `export const m = new URL('./secrets.server.ts', import.meta.url).href\n`,
    { 'src/secrets.server.ts': secrets },
  ],
  [
    'a marked file of no language, ?raw',
    `import t from './S.mdx?raw'\nexport const m = t\n`,
    {
      'src/S.mdx': `import '@tanstack/react-start/server-only'\n\n${CANARY}\n`,
    },
  ],
  [
    'a marked file that does not parse, ?raw',
    `import t from './bad.ts?raw'\nexport const m = t\n`,
    {
      'src/bad.ts': `import '@tanstack/react-start/server-only'\nconst = {{ ${CANARY}\n`,
    },
  ],
])(
  'vite build: %s is mocked and reported',
  async (_name, entry, files) => {
    const result = await buildStart({
      bundler: 'vite',
      files: {
        ...files,
        'src/entry.ts': entry,
        'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
      },
      entry: 'src/entry.ts',
      start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
    })
    expect(await emitsCanary(result.client.outDir)).toBe(false)
    expect(importersIn(result, 'client')).toEqual(['src/entry.ts'])
  },
  timeout,
)
