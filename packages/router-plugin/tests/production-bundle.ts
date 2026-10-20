/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support), per bundler and framework (SPEC G7):
 * the checks of integration/build-production*.test.ts (one file per bundler
 * group, to keep each file within its time budget).
 * The build decides production by its own signal (the bundler's production
 * mode), with `NODE_ENV` unset, and the plugin's default for `addHmr`.
 *
 * Two oracles, neither tied to how our own support code is named:
 * - the public hot APIs and the React Refresh runtime's globals are absent;
 * - a build with route HMR off (`addHmr: false`, `NODE_ENV=production` when
 *   the plugin is created) is the control: the production bundle holds the
 *   same code as the control up to names and printing, so it holds no extra
 *   support code, whatever it is called (React only: the frameworks the
 *   plugin adds Refresh support for; the other frameworks get no such
 *   support). What is compared is what names and printing cannot change,
 *   from the real parser's syntax tree: how many of each kind of syntax
 *   node the bundle has (functions, calls, declarations...), and how often
 *   it reads each global (`console`, `window`), each property name
 *   (`.warn`) and each string (chunk file names aside). Local names a
 *   compiler or minifier picks and
 *   the printer's choices are free; added code shows even when it is made of
 *   names the bundle already has (a dev-only `console.warn(...)` in a bundle
 *   that already warns: the oracle's own control, `expectDetectsAddedCode`).
 */
import path from 'node:path'
import { unboundNames } from '@tanstack/compiler-test-utils/validate-module'
import { parseSync } from 'vite'
import { expect } from 'vitest'
import { build, buildWithRsbuild, routeApp, routeHead } from './build-harness'
import type {
  BuildResult,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'
import type { Framework } from './build-harness'

export const timeout = 120_000

const route = (
  framework: Framework,
) => `${routeHead(framework)}function Page() {
  return <p>MARK_PAGE</p>
}
function Failure() {
  return <p>MARK_FAILURE</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  errorComponent: Failure,
  component: Page,
})
`

/**
 * The public development APIs: the bundlers' hot module APIs and the React
 * Refresh runtime's globals. (`__TSR_ROUTER__` is not one: the router sets
 * it in production too.)
 */
const publicDevApis: Record<string, RegExp> = {
  'import.meta.hot': /\bimport\.meta\.hot\b/,
  'import.meta.webpackHot': /\bimport\.meta\.webpackHot\b/,
  'module.hot': /\bmodule\.hot\b/,
  $RefreshReg$: /\$RefreshReg\$/,
  $RefreshSig$: /\$RefreshSig\$/,
}

/**
 * What names and printing cannot change in a bundle, by the real parser's
 * syntax tree (Oxc, Vite's), counted over its chunks: each kind of syntax
 * node (parentheses aside), and how often its code reads each free name (a
 * global: `console`, `window`), each property name (`a.warn`,
 * `{ warn: … }`) and each string or template text. Chunk file names in
 * strings (they carry content hashes) count as one placeholder.
 */
export function bundleAtoms(
  chunks: Array<{ fileName: string; code: string }>,
  fileNames = chunks.map((chunk) => path.posix.basename(chunk.fileName)),
) {
  const counts = new Map<string, number>()
  for (const chunk of chunks) {
    for (const [atom, count] of chunkAtoms(chunk, fileNames)) {
      counts.set(atom, (counts.get(atom) ?? 0) + count)
    }
  }
  return Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : 1)))
}

/** The atoms of each chunk already counted, by chunk (and file names). */
const chunkAtomsCache = new WeakMap<
  object,
  { fileNames: string; counts: Map<string, number> }
>()

/** `bundleAtoms` of one chunk of a build whose chunks are `fileNames`. */
function chunkAtoms(
  chunk: { fileName: string; code: string },
  fileNames: Array<string>,
) {
  const cached = chunkAtomsCache.get(chunk)
  if (cached?.fileNames === fileNames.join('\0')) {
    return cached.counts
  }
  const counts = new Map<string, number>()
  const add = (atom: string) => counts.set(atom, (counts.get(atom) ?? 0) + 1)
  const text = (value: string) =>
    fileNames.reduce(
      (current, fileName) => current.split(fileName).join('<chunk>'),
      value,
    )
  {
    const free = unboundNames(chunk.code)
    const { program } = parseSync('chunk.js', chunk.code, {
      sourceType: 'module',
    })
    const visit = (node: unknown, parent?: Record<string, any>): void => {
      if (Array.isArray(node)) {
        node.forEach((child) => visit(child, parent))
        return
      }
      if (!node || typeof node !== 'object') {
        return
      }
      const value = node as Record<string, any>
      if (
        typeof value.type === 'string' &&
        value.type !== 'ParenthesizedExpression'
      ) {
        add(`node ${value.type}`)
      }
      if (value.type === 'Literal' && typeof value.value === 'string') {
        add(`string ${text(value.value)}`)
      } else if (value.type === 'TemplateElement') {
        add(`string ${text(value.value.cooked ?? value.value.raw)}`)
      } else if (value.type === 'Identifier') {
        const isProperty =
          (parent?.type === 'MemberExpression' &&
            parent.property === value &&
            !parent.computed) ||
          ((parent?.type === 'Property' ||
            parent?.type === 'MethodDefinition' ||
            parent?.type === 'PropertyDefinition') &&
            parent.key === value &&
            !parent.computed)
        if (isProperty) {
          add(`property ${value.name}`)
        } else if (free.has(value.name)) {
          add(`free ${value.name}`)
        }
      }
      for (const key in value) {
        const child = value[key]
        if (key !== 'parent' && child && typeof child === 'object') {
          visit(child, value)
        }
      }
    }
    visit(program)
  }
  chunkAtomsCache.set(chunk, { fileNames: fileNames.join('\0'), counts })
  return counts
}

/**
 * The oracle's own control: code added to a real production bundle that
 * only uses names the bundle already has (a dev-only diagnostic,
 * `console.error("MARK_PAGE")`) changes what `bundleAtoms` sees, while a
 * comparison of the bundle's name tokens does not see it.
 */
function expectDetectsAddedCode(app: BuildResult) {
  const tokens = (chunks: Array<{ code: string }>) =>
    new Set(chunks.flatMap((chunk) => chunk.code.match(/[A-Za-z_$][\w$]*/g)))
  // The added code in a module of its own, next to the build's chunks.
  const added = [
    ...app.chunks,
    { fileName: 'added.js', code: 'console.error("MARK_PAGE");\n' },
  ]
  const fileNames = app.chunks.map((chunk) =>
    path.posix.basename(chunk.fileName),
  )
  expect([...tokens(added)].sort()).toEqual([...tokens(app.chunks)].sort())
  expect(bundleAtoms(added, fileNames)).not.toEqual(
    bundleAtoms(app.chunks, fileNames),
  )
}

/**
 * Builds the route for production: as an app builds it (`NODE_ENV` unset,
 * the plugin's default `addHmr`), or as the control with route HMR off.
 */
async function productionBuild(
  bundler: Bundler | 'rsbuild',
  framework: Framework,
  autoCodeSplitting: boolean,
  control: boolean,
) {
  const pluginOptions = {
    autoCodeSplitting,
    codeSplittingOptions: { addHmr: control ? false : undefined },
  }
  const nodeEnv = control ? 'production' : null
  const files = routeApp(route(framework), { env: 'client', framework })
  return bundler === 'rsbuild'
    ? buildWithRsbuild({ nodeEnv, pluginOptions, files })
    : build({
        bundler,
        framework,
        env: 'client',
        nodeEnv,
        pluginOptions,
        files,
      })
}

/**
 * Builds the route for production and asserts that the bundle renders the
 * route and has none of the dev server's additions.
 */
export async function expectProductionClientBundle(
  bundler: Bundler | 'rsbuild',
  framework: Framework,
  autoCodeSplitting: boolean,
) {
  const app = await productionBuild(
    bundler,
    framework,
    autoCodeSplitting,
    false,
  )
  const run = await app.run(`await entry.mount(entry.Route.options.component)`)
  expect(run.html).toContain('MARK_PAGE')
  expect(
    Object.keys(publicDevApis).filter(
      (name) => app.where(publicDevApis[name]!) !== 'nowhere',
    ),
  ).toEqual([])
  if (framework === 'react') {
    const control = await productionBuild(
      bundler,
      framework,
      autoCodeSplitting,
      true,
    )
    expect(bundleAtoms(app.chunks)).toEqual(bundleAtoms(control.chunks))
    expectDetectsAddedCode(app)
  }
}
