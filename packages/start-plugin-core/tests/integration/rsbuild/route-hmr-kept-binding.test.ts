/**
 * Route HMR of a Start route module that keeps a binding one of its split
 * chunks (or a `<Hydrate>` chunk) reads, on Start's Rsbuild dev server, React
 * and Solid (SPEC J3.3). The route module self-accepts, so its update holds
 * none of the chunks; the route module's next evaluation invalidates those
 * reading what it keeps and refreshes the route once the update is applied.
 *
 * The shapes of the kept binding and of the edit (primitives, objects,
 * functions, exported or not, component-only and loader-only edits, a route
 * not mounted or left, three chunks reading it) are the plain Router rows of
 * `router-plugin/tests/integration/route-hmr-browser-kept-binding.test.ts`,
 * on Rsbuild with React Refresh and Solid's hot updates. Here, what Start
 * adds: a server-rendered, hydrated page (per framework, an exported object
 * the loader and the component read, and one the component alone reads: the
 * controls), a server fn the loader and the component call, a syntax
 * error Start's dev server reports before the fix, and a `<Hydrate>` child
 * reading the kept binding.
 *
 * Each row edits twice (`v2`, `v3`) on an open, hydrated page and reads what
 * it shows, whether it reloaded, how many times the loader ran, the page's
 * errors and, for React (React Refresh), the component's state. A chunk
 * reading a kept binding evaluates again on a route module edit, so a Solid
 * component there remounts.
 *
 * The last row reads the hot updates of a `<Hydrate>` child's edit and of a
 * component edit: each holds the edited module alone, and neither runs the
 * loader or resets the component's state.
 */
import { describe, expect, test } from 'vitest'
import { pluginReact } from '@rsbuild/plugin-react'
import { openTestPage } from '../../test-page'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { reactApp, solidApp } from '../hydrate-dev-edits'
import { solidAppConfig } from '../hydrate-pages'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

type Fw = 'react' | 'solid'

const FILE = 'src/routes/index.tsx'

const imports = (fw: Fw, extra = '') =>
  `import { createFileRoute, Link } from '@tanstack/${fw}-router'
${fw === 'react' ? `import { useState } from 'react'` : `import { createSignal } from 'solid-js'`}
${extra}`

/** A component with kept state (`#c`) showing `label show` in `#t`, then `after`. */
const page = (fw: Fw, show: string, label = 'shows', after = '') =>
  fw === 'react'
    ? `function Page() {
  const [n, setN] = useState(0)
  return <div><button id="c" onClick={() => setN(n + 1)}>n={n}</button><p id="t">${label} {${show}}</p>${after}</div>
}
`
    : `function Page() {
  const [n, setN] = createSignal(0)
  return <div><button id="c" onClick={() => setN(n() + 1)}>n={n()}</button><p id="t">${label} {${show}}</p>${after}</div>
}
`

const loaderData = (fw: Fw) =>
  fw === 'react' ? 'Route.useLoaderData()' : 'Route.useLoaderData()()'

const loaderCount = `(globalThis.__loaderRuns = (globalThis.__loaderRuns ?? 0) + 1)`

interface Row {
  name: string
  only?: Fw
  files: (fw: Fw, v: string) => Record<string, string>
  shows: (v: string) => string
  /** Loader runs per edit (none: not counted). */
  loaderRuns?: number
  syntaxError?: boolean
}

const shape =
  (declare: (v: string) => string, read: string, loaderReads = true) =>
  (fw: Fw, v: string) => ({
    [FILE]: `${imports(fw)}${declare(v)}
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return ${loaderReads ? read : '1'} },
  component: Page,
})
${page(fw, read)}`,
  })

const shows = (v: string) => `shows ${v}`

const rows: Array<Row> = [
  // the controls: an exported object the loader and the component read
  // (Start's compiles of it reach the placement of an exported binding two
  // outputs share, and of the file's unused `Link` import, which the router
  // rows do not), and one the component alone reads, so only the
  // invalidation of its chunk shows the edit (the loader does not rerun with
  // it)
  {
    name: 'exported object both read',
    files: shape((v) => `export const value = { text: '${v}' }`, 'value.text'),
    shows,
    loaderRuns: 1,
  },
  {
    name: 'exported object the component reads',
    files: shape(
      (v) => `export const value = { text: '${v}' }`,
      'value.text',
      false,
    ),
    shows,
    loaderRuns: 1,
  },
  // a server fn in the route file, which the loader and the component call:
  // the client keeps its RPC stub in the route module
  {
    name: 'a server fn both read',
    files: (fw, v) => ({
      [FILE]: `${imports(fw, `import { createServerFn } from '@tanstack/${fw}-start'\n`)}const getData = createServerFn().handler(async () => '${v}')
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return getData() },
  component: Page,
})
${page(fw, loaderData(fw), 'shows', `<button id="f" onClick={() => getData().then((t) => { document.querySelector('#late')!.textContent = 'late ' + t })}>f</button><i id="late" />`)}`,
    }),
    shows,
    loaderRuns: 1,
  },
  {
    name: 'syntax error, then a fix',
    files: shape((v) => `const value = { text: '${v}' }`, 'value.text'),
    shows,
    syntaxError: true,
  },
  // a boundary in the split component reads the kept binding: its chunk
  // imports it from the route module too. (Solid: the page of a Solid
  // `<Hydrate>` route does not hydrate on Rsbuild, before this change too.)
  {
    name: 'nested split: a Hydrate child reads it',
    only: 'react',
    files: (fw, v) => ({
      [FILE]: `${imports(fw, `import { Hydrate } from '@tanstack/${fw}-start'\nimport { load } from '@tanstack/${fw}-start/hydration'\nimport { Child } from '../child'\n`)}const value = { text: '${v}' }
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${page(fw, 'value.text', 'shows', '<Hydrate when={load()}><Child text={value.text} /></Hydrate>')}`,
      'src/child.tsx': `export function Child(props: { text: string }) { return <b>boundary {props.text}</b> }\n`,
    }),
    shows: (v) => `shows ${v}boundary ${v}`,
    loaderRuns: 1,
  },
]

async function open(fw: Fw, files: Record<string, string>) {
  const server = await startRsbuildStartDevServer({
    hmr: true,
    browser: true,
    // Start serves the pages, not an HTML template
    ...(fw === 'react'
      ? { config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] } }
      : {
          framework: 'solid',
          config: {
            ...solidAppConfig.rsbuildConfig,
            tools: { htmlPlugin: false },
          },
        }),
    files: { ...(fw === 'react' ? reactApp : solidApp), ...files },
  })
  const page = await openTestPage(server.url!)
  await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
  return { server, page }
}

async function runRow(fw: Fw, row: Row) {
  const { server, page } = await open(fw, row.files(fw, 'v1'))
  const p = page.page
  const waitFor = (expected: string) =>
    page.waitForText(expected, { selector: '#app', timeout: 15_000 })
  const loaderRuns = () => p.evaluate<number>('globalThis.__loaderRuns ?? 0')
  await waitFor(row.shows('v1'))
  await p.locator('#c').click()
  await p.locator('#c').click()
  await waitFor('n=2')
  if (row.syntaxError) {
    const broken = Object.fromEntries(
      Object.entries(row.files(fw, 'v2')).map(([k, t]) => [
        k,
        t.replace('const value =', 'const value = = ('),
      ]),
    )
    await server.edit(broken)
    expect(server.errors).not.toEqual([])
  }
  for (const v of ['v2', 'v3']) {
    const before = { loads: page.loads(), runs: await loaderRuns() }
    await server.edit(row.files(fw, v))
    await waitFor(row.shows(v))
    // the fix after a failed compile may reload the page (Rsbuild's client
    // does when it showed the error); no other edit reloads
    const mayReload = row.syntaxError === true && v === 'v2'
    const reloads = page.loads() - before.loads
    expect(reloads, `${v} reloads`).toBeLessThanOrEqual(mayReload ? 1 : 0)
    if (mayReload) {
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      continue
    }
    if (row.loaderRuns !== undefined) {
      expect(await loaderRuns(), `${v} loader runs`).toBe(
        before.runs + row.loaderRuns,
      )
    }
    // (after a syntax error the page may have reloaded: no state to
    // compare; a chunk reading a kept binding evaluates again, so a Solid
    // component there remounts)
    if (!row.syntaxError && fw === 'react') {
      expect(
        await p.evaluate(`document.querySelector('#c')?.textContent`),
        `${v} state`,
      ).toBe('n=2')
    }
    if (row.name === 'a server fn both read') {
      // the stub the component calls is the edited route module's
      await p.locator('#f').click()
      await page.waitForText(`late ${v}`, { selector: '#late' })
    }
  }
  expect(page.errors).toEqual([])
}

const cases = (['react', 'solid'] as const).flatMap((fw) =>
  rows.filter((r) => !r.only || r.only === fw).map((row) => ({ fw, row })),
)

// one dev server at a time: each runs both environments and a browser page
describe('Rsbuild dev: route HMR of a binding the route module keeps and a chunk reads', () => {
  test.for(cases)('$fw: $row.name', { timeout: 90_000 }, ({ fw, row }) =>
    runRow(fw, row),
  )
})

/** The module ids of the client's hot-update chunks since the last edit. */
async function hotModules(server: RsbuildDevServer) {
  const chunks = await server.hotUpdates('client')
  return Object.values(chunks).flatMap((code) =>
    [...code.matchAll(/^(?:\/\*{3}\/ )?"([^"\n]+)"(?:\s*:|\()/gm)].map(
      (m) => m[1]!,
    ),
  )
}

describe('Rsbuild dev: hot updates of a route keeping a binding its chunks read', () => {
  test(
    'react: a Hydrate child edit and a component edit hold the edited module alone',
    { timeout: 90_000 },
    async () => {
      const route = (
        label: string,
      ) => `${imports('react', `import { Hydrate } from '@tanstack/react-start'\nimport { load } from '@tanstack/react-start/hydration'\nimport { Child } from '../child'\n`)}const value = { text: 'k' }
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${page('react', 'value.text', label, '<Hydrate when={load()}><Child text={value.text} /></Hydrate>')}`
      const child = (label: string) =>
        `export function Child(props: { text: string }) { return <b>${label} {props.text}</b> }\n`
      const { server, page: browser } = await open('react', {
        [FILE]: route('a'),
        'src/child.tsx': child('one'),
      })
      const p = browser.page
      /** What the page shows of the edit, the component's state and the loader runs. */
      const shown = async () => ({
        state: await p.evaluate(`document.querySelector('#c')?.textContent`),
        loaderRuns: await p.evaluate<number>('globalThis.__loaderRuns ?? 0'),
      })
      await browser.waitForText('one k', { selector: '#app' })
      await p.locator('#c').click()
      await p.locator('#c').click()
      await browser.waitForText('n=2', { selector: '#app' })
      const before = await shown()

      await server.edit({ 'src/child.tsx': child('two') })
      await browser.waitForText('two k', { selector: '#app' })
      expect(await shown()).toEqual({ ...before, state: 'n=2' })
      const childUpdate = await hotModules(server)
      expect(childUpdate).toHaveLength(1)
      expect(childUpdate[0]).toMatch(/src\/child\.tsx$/)

      await server.edit({ [FILE]: route('b') })
      await browser.waitForText('b k', { selector: '#app' })
      expect(await shown()).toEqual({ ...before, state: 'n=2' })
      // one module of the route file: its component's chunk (the route
      // module self-accepts, so an update holding it too would be wider)
      const componentUpdate = await hotModules(server)
      expect(componentUpdate).toHaveLength(1)
      expect(componentUpdate[0]).toContain('src/routes/index.tsx')
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
  )
})
