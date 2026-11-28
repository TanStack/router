/**
 * Freshness of a Start app on Vite's dev server, seen by a page: after a file
 * event, a dependent whose compile now fails shows its error; a nested
 * `package.json` removed updates the page at once, not at the next unrelated
 * save. (Split from
 * start-dev-freshness.test.ts, whose tests run without a browser, so that
 * file runs on the macOS and Windows smoke list.)
 */
import { describe, expect, test } from 'vitest'
import {
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { openTestPage } from '../test-page'
import { startBrowserStartDevServer } from './importProtection/client-pages'

const builder = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`

describe('Vite dev: a dependent that stops compiling', () => {
  // The page loads `main.ts`, which imports `d.ts` and `x.ts`; `x.ts`
  // re-exports `b.ts`'s `base` and accepts its own updates, so an update of
  // `b.ts` stops there. `d.ts` calls `base.handler()` with no
  // implementation: fine while `base` is a plain object, an error once it is
  // a server fn builder. After that edit of `b.ts` the error shows: the page
  // loads `d.ts` again, and the dev server reports its compile error.
  // Source: Fable 5.2 review of the Vite host (F6-5).
  test('its error shows without a request of it', async () => {
    const server = await startBrowserStartDevServer({
      files: {
        'src/b.ts': `export const base = { handler: () => 'MARK_PLAIN' }\n`,
        'src/x.ts': `export { base } from './b'
if (import.meta.hot) {
  import.meta.hot.accept()
}
`,
        'src/d.ts': `import { base } from './x'
export const fn = base.handler()
`,
        'src/main.ts': `import { fn } from './d'
import { base } from './x'
export { fn, base }
`,
      },
    })
    const url = new URL('/__ip-fixture.html', server.url)
    url.searchParams.set('entry', '/src/main.ts')
    const page = await openTestPage(url.href)
    const loaded = await page.page.waitForFunction(() => {
      const w = window as { __ipEntry?: unknown; __ipLoadError?: string }
      return w.__ipEntry ? 'loaded' : (w.__ipLoadError ?? false)
    })
    expect(await loaded.jsonValue()).toBe('loaded')
    const errorAtD = () =>
      findDiagnostics(server.diagnostics, {
        severity: 'error',
        file: 'src/d.ts',
        root: server.root,
      })
    expectNoDiagnostic(server.diagnostics, {
      severity: 'error',
      file: 'src/d.ts',
      root: server.root,
    })
    await server.edit({ 'src/b.ts': builder })
    await waitForOutcome({
      applied: () => errorAtD().length > 0,
      timeout: 15_000,
      describe: () => 'no error reported at src/d.ts',
    })
  })
})

describe('Vite dev: a nested package.json removed', () => {
  // `src/section/package.json` maps `#tool` to a file nobody wrote yet; the
  // app's own maps it to a fallback. Only a server fn handler reads it
  // (through `kit.ts`), so the client page is fine either way. Removing the
  // nested one has `#tool` find the fallback: the page's module is built
  // again at the removal, before any other file event (the harness's
  // `settle()` writes a file of its own: the removal is written alone), and
  // the next save of an unrelated file sends the page nothing, so what was
  // typed into it meanwhile stays. Source: Astra review round 4 (B1: the
  // removal sent nothing; the unrelated save then reloaded the page and
  // cleared its input; main sends nothing at either).
  test('an import only a server fn handler reads finds a fallback: the removal updates the page, an unrelated save keeps its draft', async () => {
    const server = await startBrowserStartDevServer({
      files: {
        'package.json': JSON.stringify({
          private: true,
          type: 'module',
          imports: { '#tool': './src/fallback.ts' },
        }),
        'src/section/package.json': JSON.stringify({
          private: true,
          type: 'module',
          imports: { '#tool': './unbuilt.ts' },
        }),
        'src/fallback.ts': `export const tag = () => 'MARK_FALLBACK'\n`,
        'src/section/kit.ts': `export { tag } from '#tool'\n`,
        'src/page.ts': `import { createServerFn } from '@tanstack/react-start'
import { tag } from './section/kit'
export const read = createServerFn().handler(async () => tag())
`,
        'src/hmr-sync.ts': hmrSyncModule,
        'src/probe.ts': `import './hmr-sync'
import { read } from './page'
const input = document.createElement('input')
input.dataset.read = typeof read
document.getElementById('root')!.append(input)
`,
        'src/unrelated.txt': '0',
      },
    })
    const url = new URL('/__ip-fixture.html', server.url)
    url.searchParams.set('entry', '/src/probe.ts')
    const browser = await openTestPage(url.href)
    const inFlight = trackRequests(browser)
    const input = browser.page.locator('#root input')
    await input.waitFor()
    await settlePage(server, browser, inFlight)
    /** What the server sent the client since `from`, but for custom events. */
    const clientSent = (from: number) =>
      server.hmr
        .slice(from)
        .filter((m) => m.environment === 'client' && m.type !== 'custom')
        .map((m) => `${m.type} ${m.paths.join(' ')}`)
    const removal = server.hmr.length
    await server.write({ 'src/section/package.json': null })
    await waitForOutcome({
      applied: () => clientSent(removal).length > 0,
      timeout: 10_000,
      describe: () => 'the removal sent the page nothing',
    })
    await server.settle()
    await settlePage(server, browser, inFlight)
    await input.fill('draft')
    const save = server.hmr.length
    await server.edit({ 'src/unrelated.txt': '1' })
    await settlePage(server, browser, inFlight)
    expect(clientSent(save)).toEqual([])
    expect(await input.inputValue()).toBe('draft')
    expect(await input.getAttribute('data-read')).toBe('function')
  })
})
