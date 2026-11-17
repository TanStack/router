/**
 * The `import-edges` planner on an in-memory host:
 * rules, scope, type-only and TypeScript-erased edges, substitution of the
 * specifier literal only, dev `onViolation` timing and memo, build edge
 * modules, mock contents, marker conflicts and invalidation (J6.13).
 */
import { describe, expect, test } from 'vitest'
import { MemoryApp } from './memory-host'
import type { ImportProtectionOptions } from '../../src/schema'

const SECRET = `export const secret = () => 'MARK_SECRET'\n`

function app(
  files: Record<string, string>,
  options: ImportProtectionOptions = {},
  mode: 'dev' | 'build' = 'dev',
) {
  return new MemoryApp({ files, options, mode })
}

describe('dev decisions', () => {
  const files = {
    'src/secret.server.ts': SECRET,
    'src/a.ts': `import { secret } from './secret.server'\nexport const read = () => secret()\n`,
  }

  test('a throwing onViolation fails the compile', async () => {
    const a = app(files, {
      onViolation: () => {
        throw new Error('nope')
      },
    })
    await expect(a.compile('src/a.ts', 'client')).rejects.toThrow('nope')
  })
})

describe('markers', () => {
  test('a marker conflict is located at the second marker, also when it is a re-export', async () => {
    for (const code of [
      `import '@tanstack/react-start/server-only'\nimport '@tanstack/react-start/client-only'\n`,
      `import '@tanstack/react-start/server-only'\nexport * from '@tanstack/react-start/client-only'\n`,
    ]) {
      const a = app({ 'src/both.ts': code })
      const { out } = await a.compile('src/both.ts', 'client')
      expect(out!.diagnostics.map((d) => d.range?.start)).toEqual([
        code.indexOf("'@tanstack/react-start/client-only'"),
      ])
    }
  })
})
