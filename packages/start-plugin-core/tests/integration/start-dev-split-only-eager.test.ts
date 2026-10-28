/**
 * Start's Vite dev server reports a declaration only the split component
 * reads that a later effect pins in the route module (R31 (d) / R65: an
 * inline `validateSearch: makeSchema({…})` call stays and runs after it)
 * once for the client and server environments together, positioned at the
 * declaration, and not again after an edit that keeps the finding (R78; the
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

const pinned = `import { createFileRoute } from '@tanstack/react-router'
import { Marker } from '../marker'
import { makeSchema } from '../schema'
const confetti = new Marker('MARK_CONFETTI')
export const Route = createFileRoute('/')({
  validateSearch: makeSchema({ tab: 'string' }),
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
