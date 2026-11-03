/**
 * Route HMR of a route module that keeps a binding one of its split chunks
 * reads (the route module keeps it, and the chunk imports it from there), on
 * the webpack-style hosts: Rsbuild and webpack's own dev server, React and
 * Solid (SPEC J3.3). The route module self-accepts, so its update stops
 * there and holds none of the chunks; the chunks that read what it keeps are
 * invalidated by its next evaluation and the route is refreshed once the
 * update is applied (`applyRouteHmr`).
 *
 * Each row opens a real dev server and page, edits twice (`v2`, `v3`) and
 * reads what the page shows, whether it reloaded, how many times the loader
 * ran and, where it was kept before, the component's state. The first rows
 * are the shapes of the binding; the Vite rows are the control (Vite's
 * update holds every module of the edited file).
 *
 * React on Rsbuild runs with React Refresh (`@rsbuild/plugin-react`) and
 * keeps the component's state on every edit. On Solid, a chunk that reads a
 * binding the route module keeps evaluates again on a route module edit, and
 * its component remounts: Solid's state is asserted only where no chunk reads
 * a kept binding. The webpack app has no refresh runtime (as the repo's
 * webpack example): its state isn't kept on these edits, before this change
 * either, and a component edit's update bubbles up to the route module.
 */
import { describe, expect, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { openWebpackHmrPage } from '../webpack-hmr-page'
import type { TestContext } from 'vitest'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

type Fw = 'react' | 'solid'
/**
 * webpack runs with its own `devtool` (`eval`: a chunk's update holds it
 * whenever its route file changes, as before) and with
 * `cheap-module-source-map` (it does not).
 */
type Bundler = 'rsbuild' | 'webpack' | 'webpack-maps' | 'vite'

const FILE = 'routes/index.tsx'

/**
 * The route files' markup: JSX, or `createElement` calls for React on
 * webpack (the harness compiles TypeScript only). A child is text, or an
 * expression in braces.
 */
interface Ui {
  fw: Fw
  el: (
    tag: string,
    props: Record<string, string> | null,
    ...children: Array<string>
  ) => string
  /** The route file's imports. */
  imports: (extra?: string) => string
  /** A component with kept state (a counter, `#c`) showing `label show` in `#t`, then `after`. */
  page: (show: string, label?: string, after?: string) => string
  /** The loader data, read in a component. */
  loaderData: string
}

function uiOf(fw: Fw, jsx: boolean): Ui {
  const el: Ui['el'] = (tag, props, ...children) => {
    if (jsx) {
      const attrs = Object.entries(props ?? {})
        .map(([k, v]) => ` ${k}=${v.startsWith('{') ? v : JSON.stringify(v)}`)
        .join('')
      return `<${tag}${attrs}>${children.join('')}</${tag}>`
    }
    const name = /^[A-Z]/.test(tag) ? tag : JSON.stringify(tag)
    const propsText = props
      ? `{ ${Object.entries(props)
          .map(
            ([k, v]) =>
              `${k}: ${v.startsWith('{') ? v.slice(1, -1) : JSON.stringify(v)}`,
          )
          .join(', ')} }`
      : 'null'
    // a child is text, an expression in braces, or an element
    const args = children.map((c) =>
      c.startsWith('{')
        ? c.slice(1, -1)
        : c.startsWith('createElement(')
          ? c
          : JSON.stringify(c),
    )
    return `createElement(${[name, propsText, ...args].join(', ')})`
  }
  const count = fw === 'react' ? 'n' : 'n()'
  return {
    fw,
    el,
    imports: (extra = '') =>
      `import { createFileRoute, Link } from '@tanstack/${fw}-router'
${fw === 'react' ? `import { ${jsx ? '' : 'createElement, '}memo, useState } from 'react'` : `import { createSignal } from 'solid-js'`}
${extra}`,
    page: (show, label = 'shows', after = '') => `function Page() {
  const [n, setN] = ${fw === 'react' ? 'useState' : 'createSignal'}(0)
  return ${el(
    'div',
    null,
    el(
      'button',
      { id: 'c', onClick: `{() => setN(${count} + 1)}` },
      'n=',
      `{${count}}`,
    ),
    el('p', { id: 't' }, `${label} `, `{${show}}`),
    ...(after ? [after] : []),
  )}
}
`,
    loaderData:
      fw === 'react' ? 'Route.useLoaderData()' : 'Route.useLoaderData()()',
  }
}

const loaderCount = `(globalThis.__loaderRuns = (globalThis.__loaderRuns ?? 0) + 1)`

interface Row {
  name: string
  only?: Fw
  /** Files at version `v`. */
  files: (ui: Ui, v: string) => Record<string, string>
  /** Files of the edits (default `files`). */
  edit?: (ui: Ui, v: string) => Record<string, string>
  /** What the page shows at version `v`. */
  shows: (v: string) => string
  /** Loader runs per edit (none: not counted); a function of the bundler when they differ. */
  loaderRuns?: number | ((bundler: Bundler) => number)
  /** The edits reach no chunk reading a kept binding: Solid keeps the component's state too (on Rsbuild: webpack has no refresh runtime here). */
  keepsState?: boolean
  /** Opens on another route, edits, then goes to the edited one. */
  unmounted?: boolean
  /** Opens the edited route, goes to another, edits, comes back. */
  left?: boolean
  /** A syntax error first: the fix reloads the page (the dev server's client does after a failed compile). */
  syntaxError?: boolean
}

/** A binding of version `v` the loader (or not) and the component read. */
const shape =
  (declare: (v: string) => string, read: string, loaderReads = true) =>
  (ui: Ui, v: string) => ({
    [FILE]: `${ui.imports()}${declare(v)}
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return ${loaderReads ? read : '1'} },
  component: Page,
})
${ui.page(read)}`,
  })

const shows = (v: string) => `shows ${v}`

/**
 * A component-only edit doesn't run the loader, but on webpack (no refresh
 * runtime) the chunk's update bubbles up to the route module, which
 * refreshes the route, as before.
 */
const componentEditLoaderRuns = (bundler: Bundler) =>
  bundler === 'rsbuild' ? 0 : 1

const otherRoute = (ui: Ui, text: string, link: string) =>
  `${ui.imports()}export const Route = createFileRoute('/other')({ component: () => ${ui.el('p', null, `${text} `, link)} })
`

const rows: Array<Row> = [
  // the shapes of the kept binding
  {
    name: 'exported primitive both read',
    files: shape((v) => `export const value = '${v}'`, 'value'),
    shows,
    loaderRuns: 1,
  },
  {
    name: 'exported object both read',
    files: shape((v) => `export const value = { text: '${v}' }`, 'value.text'),
    shows,
    loaderRuns: 1,
  },
  {
    name: 'exported function both read',
    files: shape((v) => `export function value() { return '${v}' }`, 'value()'),
    shows,
    loaderRuns: 1,
  },
  {
    name: 'unexported object both read',
    files: shape((v) => `const value = { text: '${v}' }`, 'value.text'),
    shows,
    loaderRuns: 1,
  },
  {
    name: 'unexported function both read',
    files: shape((v) => `function value() { return '${v}' }`, 'value()'),
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
  // an exported primitive only the component reads: the chunk copies it
  {
    name: 'exported constant, copied',
    files: shape((v) => `export const value = '${v}'`, 'value', false),
    shows,
    loaderRuns: 1,
  },
  // the component alone changes, in a route with a kept binding
  {
    name: 'component-only edit',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: 'k' }
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${ui.page('value.text', `shows-${v}`)}`,
    }),
    shows: (v) => `shows-${v} k`,
    loaderRuns: componentEditLoaderRuns,
  },
  // the same, adding lines: the route module's positions move
  {
    name: 'component-only edit, lines added',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: 'k' }
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${'// pad\n'.repeat(Number(v.slice(1)) - 1)}${ui.page('value.text', `shows-${v}`)}`,
    }),
    shows: (v) => `shows-${v} k`,
    loaderRuns: componentEditLoaderRuns,
  },
  // the loader alone changes; the chunk reads the route only
  {
    name: 'loader-only edit',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: 'k' }
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return '${v}' },
  component: Page,
})
${ui.page(`value.text + ${ui.loaderData}`)}`,
    }),
    shows: (v) => `shows k${v}`,
    loaderRuns: 1,
    keepsState: true,
  },
  // the loader alone changes; the chunk reads a binding the route module keeps
  {
    name: 'loader-only edit, the chunk reads a kept binding',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: 'k' }
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text + '${v}' },
  component: Page,
})
${ui.page(`value.text + ${ui.loaderData}`)}`,
    }),
    shows: (v) => `shows kk${v}`,
    loaderRuns: 1,
  },
  {
    name: 'the binding and the component in one edit',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: '${v}' }
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${ui.page('value.text', `shows-${v}`)}`,
    }),
    shows: (v) => `shows-${v} ${v}`,
    loaderRuns: 1,
  },
  {
    name: 'syntax error, then a fix',
    files: shape((v) => `const value = { text: '${v}' }`, 'value.text'),
    shows,
    syntaxError: true,
  },
  {
    name: 'route not mounted',
    unmounted: true,
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}export const Route = createFileRoute('/')({ component: () => ${ui.el('p', null, 'home ', ui.el('Link', { id: 'go', to: '/other' }, 'go'))} })
`,
      'routes/other.tsx': `${ui.imports()}const value = { text: '${v}' }
export const Route = createFileRoute('/other')({
  loader: () => value.text,
  component: Page,
})
${ui.page('value.text')}`,
    }),
    shows,
  },
  {
    name: 'route left, then edited',
    left: true,
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: '${v}' }
export const Route = createFileRoute('/')({
  loader: () => value.text,
  component: Page,
})
${ui.page('value.text', 'shows', ui.el('Link', { id: 'go', to: '/other' }, 'go'))}`,
      'routes/other.tsx': otherRoute(
        ui,
        'away',
        ui.el('Link', { id: 'back', to: '/' }, 'back'),
      ),
    }),
    shows,
  },
  // a split loader reads the binding the route module keeps for beforeLoad
  {
    name: 'nested split: the loader split too',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: '${v}' }
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  beforeLoad: () => value.text,
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${ui.page('value.text')}`,
    }),
    shows,
    loaderRuns: 1,
  },
  {
    name: 'nested split: three chunks read it',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: '${v}' }
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
  notFoundComponent: () => ${ui.el('p', null, '{value.text}')},
  errorComponent: () => ${ui.el('p', null, '{value.text}')},
})
${ui.page('value.text')}`,
    }),
    shows,
    loaderRuns: 1,
  },
  // an edit of a module the kept binding reads: neither the route module's
  // text nor the chunk's changes
  {
    name: 'edit of a module the kept binding reads',
    files: (ui) => ({
      [FILE]: `${ui.imports(`import { base } from '../shared'\n`)}const value = { text: base }
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${ui.page('value.text')}`,
      'shared.ts': `export const base = 'v1'\n`,
    }),
    edit: (_ui, v) => ({ 'shared.ts': `export const base = '${v}'\n` }),
    shows,
    loaderRuns: 1,
  },
  // beforeLoad writes the one object the chunk reads
  {
    name: 'one instance, written elsewhere in the file',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: 'unset' }
export const Route = createFileRoute('/')({
  beforeLoad: () => { value.text = '${v}' },
  component: Page,
})
${ui.page('value.text')}`,
    }),
    shows,
  },
  {
    name: 'a written let',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}let value = 'unset'
export const Route = createFileRoute('/')({
  beforeLoad: () => { value = '${v}' },
  component: Page,
})
${ui.page('value')}`,
    }),
    shows,
  },
  {
    name: 'an effectful initialiser',
    files: (ui, v) => ({
      [FILE]: `${ui.imports(`import { make } from '../make'\n`)}export const value = make('${v}')
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${ui.page('value.text')}`,
      'make.ts': `export const make = (text: string) => {
  ;(globalThis as any).__made = ((globalThis as any).__made ?? 0) + 1
  return { text }
}
`,
    }),
    edit: (ui, v) => ({
      [FILE]: `${ui.imports(`import { make } from '../make'\n`)}export const value = make('${v}')
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${ui.page('value.text')}`,
    }),
    shows,
    loaderRuns: 1,
  },
  // the chunk reads the binding at its own evaluation
  {
    name: 'the chunk reads it at its evaluation',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: '${v}' }
const upper = value.text + '!'
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${ui.page('upper')}`,
    }),
    shows: (v) => `shows ${v}!`,
    loaderRuns: 1,
  },
  // a memoised child reads it: nothing but a refresh re-renders it
  {
    name: 'a memoised child reads it',
    only: 'react',
    files: (ui, v) => ({
      [FILE]: `${ui.imports()}const value = { text: '${v}' }
const Inner = memo(() => ${ui.el('span', null, '{value.text}')})
export const Route = createFileRoute('/')({
  loader: () => { ${loaderCount}; return value.text },
  component: Page,
})
${ui.page(ui.el('Inner', null))}`,
    }),
    shows,
    loaderRuns: 1,
  },
]

/** One hot update the page fetched: its module ids and its size. */
interface HotUpdate {
  modules: Array<string>
  bytes: number
}

/** What a row needs of a dev server's page, whatever the bundler. */
interface App {
  edit: (files: Record<string, string>, expected: string) => Promise<boolean>
  /** Writes files the dev server fails to compile. */
  writeBroken: (files: Record<string, string>, current: string) => Promise<void>
  click: (selector: string) => Promise<void>
  waitFor: (text: string) => Promise<void>
  evaluate: <T>(script: string) => Promise<T>
  hot: Array<HotUpdate>
}

/** The module ids of a webpack-family hot-update chunk. */
const hotModules = (text: string): Array<string> =>
  // `"id"(module, …) {` (Rspack) or `"id": (…) => …` (webpack)
  [...text.matchAll(/^(?:\/\*{3}\/ )?"([^"\n]+)"(?:\s*:|\()/gm)].map(
    (m) => m[1]!,
  )

async function open(
  bundler: Bundler,
  fw: Fw,
  files: Record<string, string>,
  ready: string,
  ctx: TestContext,
): Promise<App> {
  const hot: Array<HotUpdate> = []
  const record = (page: BrowserPage['page']) => {
    page.on('response', async (response) => {
      if (/\.hot-update\.js$/.test(response.url())) {
        const text = await response.text().catch(() => '')
        hot.push({ modules: hotModules(text), bytes: text.length })
        if (process.env.KEPT_DUMP) {
          require('node:fs').writeFileSync(`/tmp/ob-hot-${Date.now()}.js`, text)
        }
      }
    })
  }
  if (bundler === 'webpack' || bundler === 'webpack-maps') {
    const app = await openWebpackHmrPage({
      target: fw,
      files,
      ready,
      devtool: bundler === 'webpack' ? undefined : 'cheap-module-source-map',
    })
    record(app.page.page)
    return {
      edit: async (edited, expected) =>
        (await app.edit(edited, expected)).reloaded,
      writeBroken: async (edited) => {
        expect(await app.write(edited)).not.toEqual([])
      },
      click: (selector) => app.page.page.locator(selector).first().click(),
      waitFor: (text) => app.page.waitForText(text, { selector: '#app' }),
      evaluate: (script) => app.page.page.evaluate(script),
      hot,
    }
  }
  const app = await openRouteHmrPage({
    onTestFinished: ctx.onTestFinished,
    bundler,
    target: fw,
    files,
    ready,
  })
  record(app.page.page)
  return {
    edit: async (edited, expected) =>
      (await app.edit(edited, expected)).reloaded,
    // the page goes on showing what it showed
    writeBroken: async (edited, current) => {
      await app.edit(edited, current)
    },
    click: app.click,
    waitFor: (text) => app.page.waitForText(text, { selector: '#app' }),
    evaluate: app.evaluate,
    hot,
  }
}

async function runRow(bundler: Bundler, fw: Fw, row: Row, ctx: TestContext) {
  // React Refresh on Rsbuild and Vite keeps state on every edit
  const webpack = bundler === 'webpack' || bundler === 'webpack-maps'
  const refresh = fw === 'react' && !webpack
  const ui = uiOf(fw, fw === 'solid' || !webpack)
  const edit = row.edit ?? row.files
  const app = await open(
    bundler,
    fw,
    row.files(ui, 'v1'),
    row.unmounted ? 'home' : row.shows('v1'),
    ctx,
  )
  const loaderRuns = () => app.evaluate<number>('globalThis.__loaderRuns ?? 0')
  if (row.left) {
    await app.click('#go')
    await app.waitFor('away')
    for (const v of ['v2', 'v3']) {
      expect(await app.edit(edit(ui, v), 'away')).toBe(false)
      await app.click('#back')
      await app.waitFor(row.shows(v))
      await app.click('#go')
      await app.waitFor('away')
    }
    return
  }
  if (!row.unmounted) {
    await app.click('#c')
    await app.click('#c')
  }
  if (row.syntaxError) {
    const broken = Object.fromEntries(
      Object.entries(edit(ui, 'v2')).map(([k, t]) => [
        k,
        t.replace('const value =', 'const value = = ('),
      ]),
    )
    await app.writeBroken(broken, row.shows('v1'))
  }
  for (const v of ['v2', 'v3']) {
    const before = await loaderRuns()
    const reloaded = await app.edit(
      edit(ui, v),
      row.unmounted ? 'home' : row.shows(v),
    )
    // the fix after a failed compile reloads the page
    const reloads = row.syntaxError === true && v === 'v2'
    expect(reloaded, `${v} reloaded`).toBe(reloads)
    if (reloads) {
      continue
    }
    if (row.loaderRuns !== undefined) {
      const runs =
        typeof row.loaderRuns === 'number'
          ? row.loaderRuns
          : row.loaderRuns(bundler)
      expect(await loaderRuns(), `${v} loader runs`).toBe(before + runs)
    }
    if (!row.unmounted && (refresh || (row.keepsState && !webpack))) {
      expect(
        await app.evaluate(`document.querySelector('#c')?.textContent`),
        `${v} state`,
      ).toBe(row.syntaxError ? 'n=0' : 'n=2')
    }
  }
  if (row.unmounted) {
    await app.click('#go')
    await app.waitFor(row.shows('v3'))
  }
}

const cases = (['react', 'solid'] as const).flatMap((fw) =>
  rows.filter((r) => !r.only || r.only === fw).map((row) => ({ fw, row })),
)

describe.concurrent(
  'route HMR of a binding the route module keeps and a chunk reads',
  { timeout: 90_000 },
  () => {
    test.for(cases)('rsbuild $fw: $row.name', ({ fw, row }, ctx) =>
      runRow('rsbuild', fw, row, ctx),
    )
    test.for(cases)('webpack $fw: $row.name', ({ fw, row }, ctx) =>
      runRow('webpack', fw, row, ctx),
    )
    test.for(cases)(
      'webpack with source maps $fw: $row.name',
      ({ fw, row }, ctx) => runRow('webpack-maps', fw, row, ctx),
    )
  },
)

/** The hot updates of an edit: no module but the edited one (the width at 5bc674ea80). */
describe.concurrent('hot updates of a route with a kept binding', () => {
  const route = (ui: Ui, label: string) => ({
    [FILE]: `${ui.imports(`import { base } from '../shared'\n`)}const value = { text: base }
export const Route = createFileRoute('/')({
  loader: () => value.text,
  component: Page,
})
${ui.page('value.text', label)}`,
    'shared.ts': `export const base = 'v1'\n`,
  })
  test.for(['react', 'solid'] as const)(
    'rsbuild %s: a component edit holds the chunk alone, a shared module edit the shared module alone',
    async (fw, ctx) => {
      const ui = uiOf(fw, true)
      const app = await open('rsbuild', fw, route(ui, 'a'), 'a v1', ctx)
      await app.edit({ [FILE]: route(ui, 'b')[FILE] }, 'b v1')
      const component = app.hot.splice(0)
      expect(component.flatMap((u) => u.modules)).toEqual([
        `./${FILE}?tsr-split=component`,
      ])
      await app.edit({ 'shared.ts': `export const base = 'v2'\n` }, 'b v2')
      expect(app.hot.flatMap((u) => u.modules)).toEqual(['./shared.ts'])
    },
  )
})
