/**
 * A file with a `<Hydrate>` boundary and a function only a server fn's
 * handler calls, which assigns module state a kept function reads
 * (spec-phase2-hydrate 3.1, L1; review-phase1 2.3). The client erases the
 * handler, so the function and its import of a denied server file go too
 * (SPEC J6, the removal rule), from the file and from the boundary's chunk.
 * Second case (L4): only the boundary's children call the kept reader, so
 * it lives in the chunk. On Start's Vite and Rsbuild dev servers (no
 * tree-shaking: what the compiler keeps is what the browser loads), the
 * page renders the boundary (its chunk loads) and import protection in mock
 * mode reports no importer of the denied file.
 */
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { describe, expect, test } from 'vitest'
import { violationRecorder } from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserRsbuildStartDevServer,
  startBrowserStartDevServer,
} from './client-pages'
import { importersIn } from './hosts'

const compileTimeout = 60_000

const shared = {
  'src/db.server.ts': `export const db = { ok: (s: string) => 'db ' + s }\n`,
  'src/chart.tsx': `export const Chart = (props: { c?: unknown }) => <p data-chart>{props.c ? 'cache' : 'chart'}</p>\n`,
  // the page renders the boundary, whose chunk loads
  'src/entry.ts': `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Page } from './page'
const root = document.createElement('div')
document.body.append(root)
createRoot(root).render(createElement(Page))
`,
}

const header = `import { createServerFn, Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { db } from './db.server'
import { Chart } from './chart'
let cache: Map<string, number> | null = null
function clear() { cache = null; return db.ok('clear') }
`

const cases = {
  // L1: the kept reader is an export (head: the file keeps `clear` and the import)
  'the kept reader is an export': `${header}export function getCache() { return (cache ??= new Map()) }
export const reset = createServerFn().handler(async () => clear())
export function Page() { return <Hydrate when={load()}><Chart /></Hydrate> }
`,
  // L4: only the children call the kept reader (head: the chunk keeps them)
  'only the children call the kept reader': `${header}function getCache() { return (cache ??= new Map()) }
export const reset = createServerFn().handler(async () => clear())
export function Page() { return <Hydrate when={load()}><Chart c={getCache()} /></Hydrate> }
`,
}

/** The text of the boundary's children once they render (null after 5 s): an observer of the document, not a poll. */
const readChart = `const chart =
  document.querySelector('[data-chart]') ??
  (await new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const found = document.querySelector('[data-chart]')
      if (found) {
        observer.disconnect()
        resolve(found)
      }
    })
    observer.observe(document, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, 5000)
  }))
return chart?.textContent ?? null`

async function devRun(host: 'vite' | 'rsbuild', page: string) {
  const recorder = violationRecorder({ behavior: 'mock', mockAccess: 'off' })
  const start = { importProtection: recorder.importProtection }
  const files = { ...shared, 'src/page.tsx': page }
  if (host === 'vite') {
    const server = await startBrowserStartDevServer({ files, start })
    const { result } = await runViteClient(server, '/src/entry.ts', readChart)
    await server.idle()
    return {
      result,
      reported: importersIn({ root: server.root, ...recorder }, 'client'),
    }
  }
  const server = await startBrowserRsbuildStartDevServer({
    compileTimeout,
    files,
    start,
  })
  const { result: run } = await captureConsole(() =>
    runInClient(server, readChart),
  )
  return {
    result: 'result' in run ? run.result : run,
    reported: importersIn({ root: server.root, ...recorder }, 'client'),
  }
}

describe.each(['vite', 'rsbuild'] as const)('%s dev', (host) => {
  test.each(Object.entries(cases))(
    'the client loads nothing only the handler reaches, nor its denied import (%s)',
    async (name, page) => {
      expect(await devRun(host, page)).toEqual({
        result: name.startsWith('only') ? 'cache' : 'chart',
        reported: [],
      })
    },
  )
})
