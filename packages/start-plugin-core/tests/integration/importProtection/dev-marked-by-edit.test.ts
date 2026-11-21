/**
 * Import protection on a Vite dev server: an edit that marks an imported
 * module server-only, the importer unchanged. The client loads the app as a
 * browser does (an importer before the modules it imports): the importer is
 * compiled again first and takes the mock, so the marked module is not
 * loaded and reported on its own, only at the import.
 * Mirrors rsbuild/import-protection.test.ts "an edit that marks an imported
 * module server-only, the importer unchanged, is reported and the importer
 * gets the mock" (Rsbuild builds the marked module first, design 3 step 2's
 * ruling).
 */
import { describe, expect, test } from 'vitest'
import {
  relevantViolations,
  startProtectedDevServer,
  violationLabel,
} from '../../importProtection/start-apps'
import type { ExpectedViolation } from '../../importProtection/start-apps'

const timeout = 60_000

/** URLs of the served modules that contain `marker`. */
function modulesContaining(modules: Record<string, string>, marker: string) {
  return Object.keys(modules).filter((url) => modules[url]!.includes(marker))
}

const markedApp = (head: string) => ({
  'src/b.ts': `${head}export const widget = () => 'MARK_B_CODE'\n`,
  'src/a.ts': `import { widget } from './b'
export const read = () => widget()
`,
  'src/entry.ts': `import { read } from './a'\nconsole.log(read())\n`,
})
const marker = `import '@tanstack/react-start/server-only'\n`
/** The use of `widget` in `src/a.ts`, its import, or the marker. */
const markerViolation: ExpectedViolation = {
  environment: 'client',
  use: 'src/a.ts:2:27',
  also: ['src/a.ts:1', 'src/b.ts:1'],
}

describe('Vite dev: an edit that marks an imported module server-only', () => {
  // Source: design 3 step 2 review (is the module reported twice on Vite,
  // whose host takes its stale set before any module is compiled again?).
  test(
    'the importer unchanged: reported once, at the import, and the importer gets the mock',
    async () => {
      const server = await startProtectedDevServer(markedApp(''))
      expect(
        modulesContaining(await server.load('/src/entry.ts'), 'MARK_B_CODE'),
      ).not.toEqual([])
      expect(server.violations).toEqual([])
      await server.edit({ 'src/b.ts': markedApp(marker)['src/b.ts'] })
      expect(
        modulesContaining(await server.load('/src/entry.ts'), 'MARK_B_CODE'),
      ).toEqual([])
      expect(relevantViolations(server, [markerViolation])).toEqual([
        violationLabel(markerViolation),
      ])
    },
    timeout,
  )
})
