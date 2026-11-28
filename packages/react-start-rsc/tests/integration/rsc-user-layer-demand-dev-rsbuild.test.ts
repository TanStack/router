/**
 * An Rsbuild dev server (RSC on) whose server compiler puts a denied file,
 * `private.client.ts`, in a layer of the user's (`reports`), imported
 * statically by an exempt file the route renders on the server: the exempt
 * import is real in the module the bundler resolved it to, in the layer's
 * compile environment (SPEC J6.7), after an edit of the denied file too,
 * and nothing reports the file; once only a checked file reaches it, it is
 * mocked and reported: through a pattern import (the file is its own
 * violation), then through a static import.
 * Source: the RSC phase 1 re-check (/var/tmp/rsc-p1-recheck/report.md §1:
 * 407da6ddac served the mock), design-rsc-phase1-graph.md §5.4 R1d; the
 * re-check 2 (/var/tmp/rsc-p1-recheck2/report.md §5, `live.py r1d`:
 * 2f8afeccc0 served the real file and reported it at its first compile)
 * and opinion-rsc-p1-dev-reporting.md (a): a module's own verdict is
 * reported once it is final, and a report that never happened leaves the
 * file's `log: 'once'` key for the pattern import's.
 */
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { recorder, summary } from './rsc-environments-app'
import { startRscRsbuildDevServer } from './rsc-serial'

const route = (
  from: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { read } from '../${from}'
const label = createIsomorphicFn()
  .server(() => String(read()))
  .client(() => 'client control')
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main data-testid="label">{label()}</main>
}
`

const importer = `import { denied } from './private.client'
export function read() {
  return denied()
}
`

/** A module reading the file through a context (`import.meta.webpackContext`: no import the compiler reads). */
const patternImporter = `const files = import.meta.webpackContext('./', {
  recursive: false,
  regExp: /^\\.\\/private\\.client\\.ts$/,
})
export function read() {
  return files('./private.client.ts').denied()
}
`

/** The route's label in the page the server renders. */
async function label(url: string): Promise<string | undefined> {
  const html = await (await fetch(new URL('/', url))).text()
  return /data-testid="label">([^<]*)</.exec(html)?.[1]
}

describe('Rsbuild dev with RSC, a denied file in a layer of the user', () => {
  test("an exempt file's import of it is real, after an edit of it too; a checked file's is mocked and reported", async () => {
    const { violations, start } = recorder('mock')
    const server = await startRscRsbuildDevServer({
      browser: true,
      start: {
        importProtection: {
          ...start.importProtection,
          exclude: ['**/feature.ts'],
        },
      },
      config: {
        tools: {
          rspack: (
            config: { module: { rules?: Array<unknown> } },
            { environment }: { environment: { name: string } },
          ) => {
            if (environment.name === 'ssr') {
              ;(config.module.rules ??= []).push({
                test: /private\.client\.ts$/,
                layer: 'reports',
              })
            }
          },
        },
      },
      files: {
        'src/routes/index.tsx': route('feature'),
        'src/feature.ts': importer,
        'src/private.client.ts': `export const denied = () => 'EXPECTED_ROUTE_LABEL'\n`,
      },
    })
    /** The warnings the server printed of the file. */
    const printed = () =>
      findDiagnostics(server.diagnostics, {
        severity: 'warning',
        file: 'src/private.client.ts',
      })
    expect(await label(server.url!)).toBe('EXPECTED_ROUTE_LABEL')
    expect({ violations, printed: printed() }).toEqual({
      violations: [],
      printed: [],
    })
    await server.edit({
      'src/private.client.ts': `export const denied = () => 'EDITED_ROUTE_LABEL'\n`,
    })
    expect(await label(server.url!)).toBe('EDITED_ROUTE_LABEL')
    expect({ violations, printed: printed() }).toEqual({
      violations: [],
      printed: [],
    })
    await server.edit({
      'src/pattern.ts': patternImporter,
      'src/routes/index.tsx': route('pattern'),
    })
    expect(await label(server.url!)).toBe('[import-protection mock]')
    expect(summary(violations)).toEqual([
      'ssr server file private.client.ts -> src/private.client.ts',
    ])
    await server.edit({
      'src/checked.ts': importer,
      'src/routes/index.tsx': route('checked'),
    })
    expect(await label(server.url!)).toBe('[import-protection mock]')
    expect(summary(violations)).toContain(
      'ssr server file checked.ts -> ./private.client',
    )
  })
})
