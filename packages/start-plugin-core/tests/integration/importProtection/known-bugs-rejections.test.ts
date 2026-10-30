/**
 * Known incorrect rejections (oracle/KNOWN-BUGS.md, "Known incorrect
 * rejections (accepted, R89)"): an importer that is not checked gets the
 * mock of a denied file instead of its real module (SPEC J6.7, J6.1). Both
 * fail safe: the client never runs the denied code. A denied file is judged
 * at its own compile, from the imports the compiler indexed; the bundler's
 * graph is not consulted there in dev, so these imports are not visible:
 * - an importer exempted by `exclude` or `ignoreImporters` that reaches the
 *   file only through a pattern import (`import.meta.glob`, a
 *   template-literal `import()`, Rsbuild's `import.meta.webpackContext`);
 * - an importer outside `srcDirectory` (never compiled by import protection)
 *   importing an in-scope denied file with a plain import.
 * A dev server reports the denied file (it knows no importer of it); a
 * build prints one warning per denied file (its importers are not checked:
 * not a violation, and the `error` behaviour does not fail the build).
 * Controls: an exempt importer's plain import gets the real module. Client
 * environment, mock mode; builds and dev servers (Vite, Vite's bundled dev,
 * Rsbuild).
 */
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { afterEach, describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import {
  startProtectedDevServer,
  violationRecorder,
} from '../../importProtection/start-apps'
import {
  runInClient,
  runViteClient,
  startBrowserStartDevServer as startDevServer,
  startBrowserRsbuildStartDevServer as startRsbuildStartDevServer,
} from './client-pages'
import { importersIn } from './v2-hosts'
import type { Recorded } from '../../importProtection/start-apps'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const timeout = 60_000
const compileTimeout = timeout

afterEach(() => {
  delete (globalThis as Record<string, unknown>).loaded
  delete (globalThis as Record<string, unknown>).uses
})

/** The exempt directories: `exclude` matches one, `ignoreImporters` the other. */
const exemptDirs = { exclude: 'excluded', ignoreImporters: 'ignored' } as const
type Option = keyof typeof exemptDirs

const importProtection: ImportProtectionOptions = {
  behavior: 'mock',
  mockAccess: 'off',
  exclude: ['src/excluded/**'],
  ignoreImporters: ['**/ignored/*.ts'],
}

/** A denied module that records that it ran, then gives `MARK_<name>`. */
const recording = (name: string) =>
  `;((globalThis as any).loaded ??= []).push('${name}')
export const ${name} = () => 'MARK_${name}'
`

/** A value as text; a mock (a callable, thenable proxy) is never awaited. */
const text = `const text = (value: unknown) =>
  typeof value === 'string' ? value : typeof value
`

/**
 * How a use in `src/<dir>/` reaches its denied file
 * `src/denied/<dir>-<kind>.server.ts` (a template: `src/dyn/`, so that its
 * pattern matches no other file).
 */
const patterns: Record<string, (dir: string, name: string) => string> = {
  plain: (
    dir,
    name,
  ) => `${text}import { ${name} } from '../denied/${dir}-plain.server'
export default () => text(${name}())
`,
  eager: (
    dir,
    name,
  ) => `${text}const modules = import.meta.glob('../denied/${dir}-eager*.ts', { eager: true })
export default () => Object.values(modules).map((m: any) => text(m.${name}()))
`,
  lazy: (
    dir,
    name,
  ) => `${text}const modules = import.meta.glob('../denied/${dir}-lazy*.ts')
export default () =>
  Promise.all(
    Object.values(modules).map((load) => load().then((m: any) => text(m.${name}()))),
  )
`,
  context: (
    dir,
    name,
  ) => `${text}const context = import.meta.webpackContext('../denied', { recursive: false, regExp: /${dir}-context[^/]*\\.ts$/ })
export default () => context.keys().map((key) => text(context(key).${name}()))
`,
  template: (dir, name) => `${text}export default (kind = 'template') =>
  import(\`../dyn/${dir}-\${kind}.server.ts\`).then((m) => [text(m.${name}())])
`,
}

interface Use {
  /** The use's key in `globalThis.uses`, and the denied module's export. */
  name: string
  importer: string
  denied: string
}

const exemptUse = (option: Option, kind: string): Use => ({
  name: `${exemptDirs[option]}_${kind}`,
  importer: `src/${exemptDirs[option]}/${kind}.ts`,
  denied: `src/${kind === 'template' ? 'dyn' : 'denied'}/${exemptDirs[option]}-${kind}.server.ts`,
})

/** Outside `srcDirectory` (`src`): import protection never checks it. */
const outsideUse: Use = {
  name: 'outside',
  importer: 'lib/outside.ts',
  denied: 'src/denied/outside.server.ts',
}

/**
 * The app: each exempt directory has a plain import and every pattern
 * `kinds` lists; `lib/outside.ts` imports its denied file plainly. The entry
 * puts every use on `globalThis.uses`.
 */
function appOf(kinds: Array<string>) {
  const files: Record<string, string> = {
    [outsideUse.denied]: recording(outsideUse.name),
    [outsideUse.importer]: `${text}import { outside } from '../src/denied/outside.server'
export default () => text(outside())
`,
  }
  const uses: Array<Use> = [outsideUse]
  for (const option of Object.keys(exemptDirs) as Array<Option>) {
    for (const kind of ['plain', ...kinds]) {
      const use = exemptUse(option, kind)
      uses.push(use)
      files[use.denied] = recording(use.name)
      files[use.importer] = patterns[kind]!(exemptDirs[option], use.name)
    }
  }
  files['src/entry.ts'] = `${uses
    .map(
      ({ name, importer }) =>
        `import ${name} from '${importer.startsWith('lib/') ? '../' : './'}${importer.replace(/^src\//, '').replace(/\.ts$/, '')}'`,
    )
    .join('\n')}
;(globalThis as any).uses = { ${uses.map(({ name }) => name).join(', ')} }
`
  files['src/router.ts'] = `import './entry'
export const getRouter = () => undefined
`
  return files
}

/** Calls every use; the values (or `throws`) and the denied modules that ran. */
const readScript = `const values = {}
for (const [name, use] of Object.entries(globalThis.uses)) {
  try {
    values[name] = String(await use())
  } catch {
    values[name] = 'throws'
  }
}
return { values, loaded: globalThis.loaded ?? [] }`

interface Read {
  values: Record<string, string>
  loaded: Array<string>
}

interface Outcome extends Read {
  /** The reported client files (the importer in a build, the denied file in dev). */
  reported: Array<string>
  /** A build's warnings about unchecked importers (none in dev). */
  unchecked?: Array<string>
}

const outcome = (read: Read, recorded: Recorded): Outcome => ({
  ...read,
  reported: importersIn(recorded, 'client'),
})

const uncheckedHeader =
  '[import-protection] Denied file mocked in client environment, for importers that are not checked'

async function build(
  bundler: 'vite' | 'rsbuild',
  files: Record<string, string>,
  behavior: 'mock' | 'error' = 'mock',
): Promise<Outcome> {
  const built = await buildStart({
    bundler,
    files,
    entry: 'src/entry.ts',
    start: { importProtection: { ...importProtection, behavior } },
  })
  const { result } = await built.client.run(readScript)
  return {
    ...outcome(result as Read, built),
    unchecked: problems(built.diagnostics)
      .map(({ text }) => text)
      .filter((text) => text.includes(uncheckedHeader)),
  }
}

async function viteDev(files: Record<string, string>): Promise<Outcome> {
  const recorder = violationRecorder(importProtection)
  const server = await startDevServer({
    browser: true,
    start: { importProtection: recorder.importProtection },
    files,
  })
  const { result } = await runViteClient(server, '/src/router.ts', readScript)
  await server.idle()
  return outcome(result as Read, { root: server.root, ...recorder })
}

/** Full-bundle dev: a use got the real module when the client bundle holds its value. */
async function viteBundledDev(
  files: Record<string, string>,
  uses: Array<Use>,
): Promise<Outcome> {
  const server = await startProtectedDevServer(files, importProtection, {
    router: 'src/router.ts',
    bundledDev: { entry: 'src/router.ts' },
  })
  const bundle = Object.values(await server.clientBundle()).join('\n')
  const real = uses.filter(({ name }) => bundle.includes(`MARK_${name}`))
  return {
    values: Object.fromEntries(
      uses.map(({ name }) => [
        name,
        real.some((use) => use.name === name) ? `MARK_${name}` : 'mock',
      ]),
    ),
    loaded: real.map(({ name }) => name),
    reported: importersIn(server, 'client'),
  }
}

async function rsbuildDev(files: Record<string, string>): Promise<Outcome> {
  const recorder = violationRecorder(importProtection)
  const server = await startRsbuildStartDevServer({
    compileTimeout,
    browser: true,
    hmr: false,
    files,
    start: { importProtection: recorder.importProtection },
  })
  const { result } = await captureConsole(() => runInClient(server, readScript))
  return outcome((result as { result: Read }).result, {
    root: server.root,
    ...recorder,
  })
}

const viteKinds = ['eager', 'lazy', 'template']
const rsbuildKinds = ['context', 'template']

const hosts = [
  {
    name: 'vite build',
    kinds: viteKinds,
    build: 'vite' as const,
    run: (files: Record<string, string>) => build('vite', files),
  },
  { name: 'vite dev', kinds: viteKinds, run: viteDev },
  { name: 'vite bundledDev', kinds: viteKinds, run: viteBundledDev },
  {
    name: 'rsbuild build',
    kinds: rsbuildKinds,
    build: 'rsbuild' as const,
    run: (files: Record<string, string>) => build('rsbuild', files),
  },
  { name: 'rsbuild dev', kinds: rsbuildKinds, run: rsbuildDev },
]

/** What `uses` got, and the reports naming their importers or denied files. */
function about(result: Outcome, uses: Array<Use>) {
  const files = uses.flatMap(({ importer, denied }) => [importer, denied])
  return {
    values: Object.fromEntries(
      uses.map(({ name }) => [name, result.values[name]]),
    ),
    loaded: uses
      .map(({ name }) => name)
      .filter((name) => result.loaded.includes(name)),
    reported: result.reported.filter((file) => files.includes(file)),
  }
}

/** The real module of each use, nothing reported. */
const realModules = (uses: Array<Use>) => ({
  values: Object.fromEntries(uses.map(({ name }) => [name, `MARK_${name}`])),
  loaded: uses.map(({ name }) => name),
  reported: [],
})

const options = Object.keys(exemptDirs) as Array<Option>

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A build's warnings about `uses` (R89 amendment), by the denied file each
 * names: one per denied file, naming its importer, then the fix.
 */
const warnings = (unchecked: Array<string>, uses: Array<Use>) => {
  const deniedOf = (text: string) => /Denied file: (\S+)/.exec(text)?.[1]
  const named = unchecked.filter((text) =>
    uses.some(({ denied }) => deniedOf(text) === denied),
  )
  return {
    count: named.length,
    byFile: Object.fromEntries(named.map((text) => [deniedOf(text), text])),
  }
}

/** What `warnings` gives when each of `uses` is warned about (Rspack prefixes each line with `│`). */
const warningsNaming = (uses: Array<Use>) => ({
  count: uses.length,
  byFile: Object.fromEntries(
    uses.map(({ importer, denied }) => [
      denied,
      expect.stringMatching(
        new RegExp(
          `\n[│ ]* {4}- ${escaped(importer)}\n[^]*${escaped('import the file statically from an exempt module inside the scope')}`,
        ),
      ),
    ]),
  ),
})

describe.each(hosts)('$name', ({ kinds, run, build: bundler }) => {
  const files = appOf(kinds)
  const allUses = [
    outsideUse,
    ...options.flatMap((option) =>
      ['plain', ...kinds].map((kind) => exemptUse(option, kind)),
    ),
  ]
  /** The uses the accepted cases mock. */
  const mocked = [
    outsideUse,
    ...options.flatMap((option) =>
      kinds.map((kind) => exemptUse(option, kind)),
    ),
  ]
  let ran: Promise<Outcome> | undefined
  const result = () => (ran ??= run(files, allUses))

  // Control: the same exempt importers, with a plain import.
  test.each(options)(
    'an importer exempted by %s gets the real module of a denied file it imports, and is not reported',
    async (option) => {
      const uses = [exemptUse(option, 'plain')]
      expect(about(await result(), uses)).toEqual(realModules(uses))
    },
    timeout,
  )

  // Accepted (safe direction): the denied file is judged at its own compile
  // from the imports the planner indexed for exempt importers
  // (`allowsSelf`, src/import-protection/session.ts); the bundler expands a
  // pattern import, and its graph is not consulted there, so the exempt
  // importer is not seen: the file is mocked (and reported in dev).
  // Impact: an exempt importer (tests, generated code) that globs server
  // files gets mocks; writing the imports statically gives the real modules.
  test.fails.each(options)(
    'an importer exempted by %s reaching a denied file only through a pattern import gets the real module, and is not reported',
    async (option) => {
      const uses = kinds.map((kind) => exemptUse(option, kind))
      expect(about(await result(), uses)).toEqual(realModules(uses))
    },
    timeout,
  )

  // Accepted (safe direction): an importer outside the scope is not
  // compiled by import protection, so its imports are never indexed and
  // the in-scope denied file, judged at its own compile, is mocked (and
  // reported in dev).
  // Impact: code outside `srcDirectory`/`include` gets mocks of the app's
  // server files; importing them from a module inside the scope gives the
  // real modules.
  test.fails(
    'an importer outside srcDirectory gets the real module of an in-scope denied file it imports, and is not reported',
    async () => {
      expect(about(await result(), [outsideUse])).toEqual(
        realModules([outsideUse]),
      )
    },
    timeout,
  )

  // R89 amendment: a build warns about each file the accepted cases mock;
  // not a violation (`onViolation` is not called, the build does not fail).
  test.runIf(bundler)(
    'a build warns once about each denied file whose every importer is exempt or outside srcDirectory, naming it, its importers and the fix',
    async () => {
      const outcome = await result()
      expect({
        reported: about(outcome, allUses).reported,
        warnings: warnings(outcome.unchecked!, allUses),
      }).toEqual({ reported: [], warnings: warningsNaming(mocked) })
    },
    timeout,
  )

  test.runIf(bundler)(
    'a build with the error behaviour does not fail on them, and warns the same',
    async () => {
      const outcome = await build(bundler!, files, 'error')
      expect({
        reported: about(outcome, allUses).reported,
        warnings: warnings(outcome.unchecked!, allUses),
      }).toEqual({ reported: [], warnings: warningsNaming(mocked) })
    },
    timeout,
  )

  // Dev (unchanged): the dev server knows no importer of the denied file
  // when it compiles it, and reports the file itself.
  test.skipIf(bundler)(
    'a dev server reports each denied file only an unchecked importer reaches',
    async () => {
      expect(about(await result(), mocked).reported).toEqual(
        mocked.map(({ denied }) => denied).sort(),
      )
    },
    timeout,
  )
})
