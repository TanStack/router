/**
 * Start's Vite dev server reports a declaration only the split component
 * reads that a staying statement changes (it also uses what
 * `validateSearch` keeps), which stays in the route module
 * once for the client and server environments together, positioned at the
 * declaration, and not again after an edit that keeps the finding (the
 * builds: start-build-eager-export.test.ts).
 */
import { expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { startDevServer } from '../dev-server'
import { reactApp } from './hydrate-dev-edits'

const timeout = 90_000

// (two split options reading it would share a lazy module, R151; a
// statement changing it that uses what the route module keeps keeps it,
// `written`)
const pinned = `import { createFileRoute } from '@tanstack/react-router'
import { Marker } from '../marker'
const settings = { tab: 'string' }
const confetti = new Marker('MARK_CONFETTI')
confetti.attach(settings)
export const Route = createFileRoute('/')({
  validateSearch: () => settings,
  component: () => <p>{confetti.name}</p>,
})
`

test(
  'warns once for both environments, and not again after an edit that keeps the finding',
  async () => {
    const server = await startDevServer({
      start: {},
      files: {
        ...reactApp,
        'src/routes/index.tsx': pinned,
        'src/marker.ts': `export class Marker {
  constructor(public name: string) {}
  attach(settings: object) {
    ;(this as any).settings = settings
  }
}
`,
        'src/schema.ts':
          'export function makeSchema<T>(shape: T) { return shape }\n',
      },
    })
    const where = { file: 'src/routes/index.tsx', root: server.root }
    for (const environment of ['client', 'ssr']) {
      await server.transform('/src/routes/index.tsx', environment)
    }
    expectDiagnostic(server.diagnostics, {
      severity: 'warning',
      ...where,
      position: diagnosticPosition(pinned, 'confetti = new'),
      times: 1,
    })
    const since = server.diagnostics.length
    await server.edit({ 'src/routes/index.tsx': `${pinned}// edited\n` })
    for (const environment of ['client', 'ssr']) {
      expect(
        await server.transform('/src/routes/index.tsx', environment),
      ).toContain('// edited')
    }
    expect(findDiagnostics(server.diagnostics.slice(since), where)).toEqual([])
  },
  timeout,
)
