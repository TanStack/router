/**
 * Unusual but valid route files split like any other: route files with
 * non-ASCII names or a `'` in their name and JavaScript route files, an import of a package named
 * like a member of `Object.prototype`, a BOM and a source map comment, and
 * option values written as a sequence under a cast, in real builds.
 */
import { expect, test } from 'vitest'
import { expectNoDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import {
  build,
  buildShared,
  clientMountEntry,
  head,
  rootRoute,
  routeApp,
} from '../build-harness'

/**
 * One app per bundler holds both unusual route files: a route
 * file with a non-ASCII name (its route at `/café/日本語`, re-exported by
 * the entry as `CafeRoute`) and a JavaScript route file (`routes/index.jsx`,
 * the entry's `Route`). Built once and run once per route; each test reads
 * its own route's markers.
 */
type BundlerName = 'vite' | 'rspack' | 'webpack'

const results = new Map<BundlerName, ReturnType<typeof buildApp>>()

function appOf(bundler: BundlerName) {
  let result = results.get(bundler)
  if (!result) {
    result = buildApp(bundler)
    results.set(bundler, result)
  }
  return result
}

async function buildApp(bundler: BundlerName) {
  const app = await buildShared({
    bundler,
    env: 'client',
    // No outcome here depends on webpack's minifier (terser), which takes
    // most of a webpack build: generation, placement of live code and the
    // rendering.
    ...(bundler === 'webpack' && { minify: false }),
    // Files outlive the test that built them; the result is all we keep
    files: {
      'routes/__root.tsx': rootRoute,
      'routes/café.日本語.tsx': `${head}function Page() {
  return <p>MARK_CAFE_COMPONENT</p>
}
export const Route = createFileRoute('/café/日本語')({
  staticData: { label: 'MARK_CAFE_ROUTE' },
  component: Page,
})
`,
      // (SPEC §2.1: a `'` in a route file's name; the chunks import the
      // route file by a specifier holding it)
      "routes/what's-new.tsx": `${head}function Page() {
  return <p>MARK_QUOTE_COMPONENT</p>
}
export const Route = createFileRoute("/what's-new")({ component: Page })
`,
      'routes/index.jsx': `${head}const shared = { label: 'MARK_SHARED' }
function Page() {
  return <p>MARK_COMPONENT {shared.label}</p>
}
export const Route = createFileRoute('/')({
  loader: () => shared,
  component: Page,
})
`,
      // option values main splits (a cast) around a sequence: the chunk
      // evaluates the sequence, it does not declare its operands
      'routes/sequence.tsx': `${head}const box = { Page: () => <p>MARK_SEQUENCE_COMPONENT</p> }
function Fallback() {
  return <p>MARK_SEQUENCE_ERROR</p>
}
export const Route = createFileRoute('/sequence')({
  component: (0, box.Page) as any,
  errorComponent: (0, Fallback) as any,
})
`,
      'entry.ts': `${clientMountEntry}export { Route as CafeRoute } from './routes/café.日本語'
export { Route as QuoteRoute } from "./routes/what's-new"
export { Route as SequenceRoute } from './routes/sequence'
`,
    },
  })
  try {
    const cafe = await app.run(
      `await entry.mount(entry.CafeRoute.options.component)`,
    )
    const quote = await app.run(
      `await entry.mount(entry.QuoteRoute.options.component)`,
    )
    const sequence = await app.run(
      `await entry.mount(entry.SequenceRoute.options.component)`,
    )
    const sequenceError = await app.run(
      `await entry.mount(entry.SequenceRoute.options.errorComponent)`,
    )
    const jsx = await app.run(
      `await entry.mount(entry.Route.options.component)
return entry.Route.options.loader().label`,
    )
    return {
      cafe: {
        route: app.where('MARK_CAFE_ROUTE'),
        component: app.where('MARK_CAFE_COMPONENT'),
        html: cafe.html,
      },
      quote: {
        component: app.where('MARK_QUOTE_COMPONENT'),
        html: quote.html,
      },
      sequence: {
        component: app.where('MARK_SEQUENCE_COMPONENT'),
        errorComponent: app.where('MARK_SEQUENCE_ERROR'),
        html: [sequence.html, sequenceError.html],
      },
      jsx: {
        component: app.where('MARK_COMPONENT'),
        html: jsx.html,
        loaded: jsx.result,
      },
    }
  } finally {
    await app.dispose()
  }
}

test.each(['vite', 'rspack', 'webpack'] as const)(
  'a route file with a non-ASCII name is generated, split and rendered (%s)',
  async (bundler) => {
    expect((await appOf(bundler)).cafe).toEqual({
      route: 'eager',
      component: 'lazy',
      html: '<div id="root"><p>MARK_CAFE_COMPONENT</p></div>',
    })
  },
  120_000,
)

test.each(['vite', 'rspack', 'webpack'] as const)(
  "a route file with a ' in its name is generated, split and rendered (%s)",
  async (bundler) => {
    expect((await appOf(bundler)).quote).toEqual({
      component: 'lazy',
      html: '<div id="root"><p>MARK_QUOTE_COMPONENT</p></div>',
    })
  },
  120_000,
)

// Source: splicing gate (B1), a regression of 4ef7358870.
test.each(['vite', 'rspack', 'webpack'] as const)(
  'a sequence under a cast is split and rendered (%s)',
  async (bundler) => {
    expect((await appOf(bundler)).sequence).toEqual({
      component: 'lazy',
      errorComponent: 'lazy',
      html: [
        '<div id="root"><p>MARK_SEQUENCE_COMPONENT</p></div>',
        '<div id="root"><p>MARK_SEQUENCE_ERROR</p></div>',
      ],
    })
  },
  120_000,
)

// A JavaScript route file (`.jsx`) splits like a TypeScript one in each
// bundler's build.
test.each(['vite', 'rspack', 'webpack'] as const)(
  'a .jsx route file is generated, split and rendered (%s)',
  async (bundler) => {
    expect((await appOf(bundler)).jsx).toEqual({
      component: 'lazy',
      html: '<div id="root"><p>MARK_COMPONENT MARK_SHARED</p></div>',
      loaded: 'MARK_SHARED',
    })
  },
  120_000,
)

// A statement may end without a `;`: at the end of a file with no final
// newline, or on the line break inside a comment. What renders after it (the
// chunk's export, the next statement kept, a generated declaration) starts a
// statement of its own: a compile error otherwise, or, after a line comment,
// a chunk that silently exports nothing.
const unterminated = [
  {
    name: 'the last statement has no `;` and no final newline',
    route: `${head}export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <p>{text}</p>
}
const text = 'MARK'`,
  },
  {
    name: 'the last statement is the component',
    route: `${head}export const Route = createFileRoute('/')({ component: Home })
const Home = () => <p>MARK</p>`,
  },
  {
    name: 'the last statement is an import the chunk needs',
    route: `export const Route = createFileRoute('/')({ component: Home })
const Home = () => <p>{text}</p>
${head}import { text } from '../text'`,
  },
  {
    name: 'the last statement is one of two declarators',
    route: `${head}export const Route = createFileRoute('/')({ component: Home })
const unused = 1, Home = () => <p>MARK</p>`,
  },
  {
    name: 'a line comment ends the file',
    route: `${head}export const Route = createFileRoute('/')({ component: Home })
const Home = () => <p>MARK</p> // done`,
  },
  {
    name: 'a block comment ends the file',
    route: `${head}export const Route = createFileRoute('/')({ component: Home })
const Home = () => <p>MARK</p> /* done */`,
  },
  {
    name: 'CRLF line ends and no final newline',
    route:
      `${head}export const Route = createFileRoute('/')({ component: Home })
const Home = () => <p>MARK</p>`.replaceAll('\n', '\r\n'),
  },
  {
    name: 'a comment holds the line break before the route',
    route: `${head}const Home = () => <p>MARK</p> /* first
second */ export const Route = createFileRoute('/')({ component: Home })
`,
  },
  {
    name: 'a license comment holds the line break before the route',
    route: `${head}const Home = () => <p>MARK</p> /*! first
second */ export const Route = createFileRoute('/')({ component: Home })
`,
  },
  {
    name: 'a comment holds the line break before a statement that moves',
    route: `${head}globalThis.first = 'MARK' /* first
second */ const Home = () => <p>{globalThis.first}</p>
globalThis.second = globalThis.first
export const Route = createFileRoute('/')({ component: Home })
`,
  },
  {
    name: 'a comment holds the line break before a statement that goes',
    route: `${head}export const Route = createFileRoute('/')({ component: Home })
const Home = () => <p>MARK</p> /* first
second */ const unused = 1
const alsoUnused = 2`,
  },
  // (a line comment ending with `{` or `;` ends no statement)
  ...['{', ';'].map((end) => ({
    name: `a line comment ending with \`${end}\` is the last text before a statement that moves`,
    route: `${head}globalThis.first = 'MARK' // first ${end}
const Home = () => <p>{globalThis.first}</p>
export const Route = createFileRoute('/')({ component: Home })
`,
  })),
  {
    name: 'a comment holds the line break before the route, which gets the importer',
    route: `${head}globalThis.first = 'MARK' /* first
second */ export const Route = createFileRoute('/')({
  component: () => <p>{globalThis.first}</p>,
})
`,
  },
]

let unterminatedResults: Promise<Array<string>> | undefined

async function buildUnterminated() {
  const app = await buildShared({
    bundler: 'vite',
    env: 'ssr',
    minify: false,
    prefix: '.regression-build-',
    files: {
      'routes/__root.tsx': rootRoute,
      'text.ts': `export const text = 'MARK'\n`,
      ...Object.fromEntries(
        unterminated.map((row, i) => [`routes/r${i}.tsx`, row.route]),
      ),
      'entry.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
${unterminated.map((_, i) => `import { Route as R${i} } from './routes/r${i}'`).join('\n')}
export const routes = [${unterminated.map((_, i) => `R${i}`).join(', ')}]
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`,
    },
  })
  try {
    return (
      await app.run(
        `return Promise.all(entry.routes.map((r) => entry.render(r.options.component)))`,
      )
    ).result as Array<string>
  } finally {
    await app.dispose()
  }
}

test.each(unterminated.map((row, i) => [row.name, i] as const))(
  'a split route renders when %s',
  async (_name, i) => {
    unterminatedResults ??= buildUnterminated()
    expect((await unterminatedResults)[i]).toBe('<p>MARK</p>')
  },
  60_000,
)

// A specifier naming a member of Object.prototype must not find it in a table
// of known packages or markers.
test.each(['constructor', '__proto__', 'toString'])(
  'an import from a package named %s builds',
  async (name) => {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      minify: false,
      files: routeApp(
        `${head}import { x } from '${name}'
export const Route = createFileRoute('/')({ component: () => <p>{x}</p> })
`,
        {
          env: 'client',
          files: {
            'entry.ts': clientMountEntry,
            [`node_modules/${name}/package.json`]: JSON.stringify({
              name,
              type: 'module',
              exports: './index.js',
            }),
            [`node_modules/${name}/index.js`]: `export const x = 'MARK_X'\n`,
          },
        },
      ),
    })
    expect(app.where('MARK_X')).toBe('lazy')
  },
  60_000,
)

const stateRoute = `${head}let state = 0
export const Route = createFileRoute('/')({
  loader: () => 1,
  component: () => <p>{state}</p>,
})
`

// The text of every id of the file differs from the file's only by what no
// plugin wrote: nothing is reported
test.each([
  ['a BOM', `\uFEFF${stateRoute}`],
  [
    'a source map comment',
    `${stateRoute}//# sourceMappingURL=data:application/json,{}\n`,
  ],
])(
  'a route file with %s builds without a report',
  async (_name, route) => {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      minify: false,
      files: routeApp(route, {
        env: 'client',
        files: { 'entry.ts': clientMountEntry },
      }),
    })
    expectNoDiagnostic(app, {
      severity: 'warning',
      file: 'routes/index.tsx',
      root: app.root,
    })
  },
  60_000,
)
