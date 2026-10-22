/**
 * Where import protection tells the user a violation is: the location it
 * reports for the importer (its `file:line:column`) should be the use
 * of the denied import that leaks into the environment, in the user's
 * source. Read from what a real app reports with Start's default rules: the
 * Vite dev server's warnings (mock mode), and the errors of an Rsbuild dev
 * server and of Vite and Rsbuild builds (error mode). The Vite and Rsbuild
 * adapters look for the use in a different order (Vite: compiled code first,
 * Rsbuild: original source first), so each case runs on both. The chain
 * and the code frame of a report: reported-location-trace.test.ts.
 */
import { describe, expect, test } from 'vitest'
import {
  at,
  channels,
  expectRelevantLocation,
  reportedLocations,
  timeout,
} from './reported-location-app'
import type { Channel } from './reported-location-app'

interface LocationCase {
  name: string
  code: string
  /**
   * The places the report may point at: the genuine surviving uses
   * (`src/a.tsx:line:column`, or `src/a.tsx:line` for any column of the
   * line) and the line of the static import of the denied module
   * (`expectRelevantLocation`).
   */
  expected: Array<string>
}

const afterHandler = `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret.server'
export const fn = createServerFn().handler(async () => secret())
export const leak = () => secret()
`

const memberProperty = `import { eq } from './secret.server'
const db = { eq: (n: number) => n }
export const a = db.eq(1)
export const b = eq
`

const typePosition = `import { secret } from './secret.server'
type Secret = typeof secret
export const check = (value: Secret) => value
export const leak = secret
`

const jsxElement = `import Secret from './secret.server'
export const Page = () => <Secret />
`

// A value named like a server fn builder (`*ServerFn`) is not one: the
// client keeps its `handler` callback and the use inside it.
const lookAlike = `import { secret } from './secret.server'
const myServerFn = { handler: (fn: () => unknown) => fn() }
export const fn = myServerFn.handler(() => secret())
`

const isomorphicClient = `import { createIsomorphicFn } from '@tanstack/react-start'
import { secret } from './secret.server'
export const fn = createIsomorphicFn().client(() => secret())
`

const unicode =
  "import { secret } from './secret.server'\r\n" +
  '// 👨‍👩‍👧 𝒳𝒴 日本語\r\n' +
  "\texport const label = '🎉'; export const value = () => secret()\r\n"

// (Each shadowing binding is read like the real use, so a lookup that
// prefers calls cannot step over a shadow it does not see: V4 red-astra/19.)
const catchShadow = `import { secret } from './secret.server'
export const run = () => {
  try { return 1 } catch (secret) { console.log(secret) }
}
export const leak = secret
`

const scopeShadow = `import { secret } from './secret.server'
export const inner = (secret: unknown) => secret
export function hoisted() {
  if (Math.random() > 2) {
    var secret = 1
  }
  return secret
}
export const leak = secret
`

const wrappedBoundary = `import { createServerOnlyFn } from '@tanstack/react-start'
import { secret } from './secret.server'
const wrap = <T,>(fn: T) => fn
const run = (fn: () => unknown) => fn()
export const a = createServerOnlyFn(wrap(() => secret()))
export const b = run(() => secret())
`

const dynamicImport = `export const load = () =>
  import('./secret.server', { with: {} })
`

const reExport = `export const one = 1
export { secret } from './secret.server'
`

const cases: Record<string, LocationCase> = {
  afterHandler: {
    name: 'a use after a server fn handler (the handler is not reported)',
    code: afterHandler,
    expected: [at(afterHandler, 4, 'secret()'), 'src/a.tsx:2'],
  },
  memberProperty: {
    name: 'a use after a member property named like the import',
    code: memberProperty,
    expected: [at(memberProperty, 4, 'eq'), 'src/a.tsx:1'],
  },
  typePosition: {
    name: 'a use after a type position',
    code: typePosition,
    expected: [at(typePosition, 4, 'secret'), 'src/a.tsx:1'],
  },
  jsxElement: {
    name: 'a JSX element',
    code: jsxElement,
    expected: [
      at(jsxElement, 2, '<Secret'),
      at(jsxElement, 2, 'Secret'),
      'src/a.tsx:1',
    ],
  },
  lookAlike: {
    name: 'a use inside the handler method of an object named like a server fn',
    code: lookAlike,
    expected: [at(lookAlike, 3, 'secret()'), 'src/a.tsx:1'],
  },
  isomorphicClient: {
    name: 'a use inside createIsomorphicFn().client',
    code: isomorphicClient,
    expected: [at(isomorphicClient, 3, 'secret()'), 'src/a.tsx:2'],
  },
  // A lone CR is a line terminator, like LF. Source: the #8504 probe (R-11).
  loneCr: {
    name: 'a use after a server fn handler, in a file with lone CR line endings',
    code: afterHandler.replaceAll('\n', '\r'),
    expected: [at(afterHandler, 4, 'secret()'), 'src/a.tsx:2'],
  },
  // Ported from the internal usage lookup (V1 ip S24): columns count UTF-16
  // code units (what editors and source maps count) after astral
  // characters, a tab and CRLF line endings.
  unicode: {
    name: 'a use after astral characters and a tab, with CRLF line endings',
    code: unicode,
    expected: [at(unicode, 3, 'secret()'), 'src/a.tsx:1'],
  },
  catchShadow: {
    name: 'a use after a catch clause parameter named like the import',
    code: catchShadow,
    expected: [at(catchShadow, 5, 'secret'), 'src/a.tsx:1'],
  },
  scopeShadow: {
    name: 'a use after a parameter and a hoisted var named like the import',
    code: scopeShadow,
    expected: [at(scopeShadow, 9, 'secret'), 'src/a.tsx:1'],
  },
  // The client compile removes a `createServerOnlyFn(...)` call whatever
  // its argument is, so a use inside a wrapped function is gone (V1 ip
  // S26, replacing the internal pin on the original-source lookup).
  wrappedBoundary: {
    name: 'a use after a createServerOnlyFn whose function is wrapped in a call',
    code: wrappedBoundary,
    expected: [at(wrappedBoundary, 6, 'secret()'), 'src/a.tsx:2'],
  },
  // Other import forms (V1 ip S14): the dynamic import (with import
  // attributes) and the re-export are the uses, on their line.
  dynamicImport: {
    name: 'a dynamic import with import attributes',
    code: dynamicImport,
    expected: [`src/a.tsx:2`],
  },
  reExport: {
    name: 'a re-export',
    code: reExport,
    expected: [`src/a.tsx:2`],
  },
}

/** The rows of `cases` on `channels`. */
const rows = (names: Array<string>, on: Array<Channel>) =>
  names.flatMap((name) => on.map((channel) => ({ ...cases[name]!, channel })))

describe('the reported location of a violation is the leaking use or the import', () => {
  // Source (lookAlike, isomorphicClient): moved from
  // analysis.usage.test.ts, which rebuilt the Vite plugin's location
  // lookup from internals (audit F-H3).
  test.each([
    ...rows(['afterHandler', 'loneCr', 'isomorphicClient'], channels),
    ...rows(['unicode', 'catchShadow', 'scopeShadow', 'reExport'], channels),
    ...rows(['wrappedBoundary', 'dynamicImport'], ['vite dev', 'vite build']),
    ...rows(['lookAlike'], ['vite dev', 'vite build']),
    ...rows(['typePosition', 'jsxElement'], ['vite dev', 'vite build']),
  ])(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(await reportedLocations(channel, code), expected)
    },
    timeout,
  )

  // Bug: the usage lookup counts a member property named like a denied import
  // (`db.eq`) as a use of the import (shared `findPostCompileUsagePos` /
  // `findOriginalUnsafeUsagePos` in import-protection/analysis.ts, used by
  // both adapters).
  // Impact: the violation points at an unrelated line, so the user looks for
  // the leak in the wrong place.
  // Source: PR #8504 (analysis.usage.test.ts "ignores a member property named
  // like the import but still finds later usage"); moved from the pin on the
  // internal helper (analysis.usage.test.ts).
  test.fails.each(rows(['memberProperty'], channels))(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(await reportedLocations(channel, code), expected)
    },
    timeout,
  )

  // NEW bug (Rsbuild): the original-source usage lookup, which the Rsbuild
  // adapter tries first, takes any `<name>ServerFn.handler(...)` callback for
  // a server fn handler by its name (`/ServerFn$/`, `isCompilerSafeBoundaryCall`
  // in import-protection/analysis.ts) and skips the use inside it; the
  // compiled-code lookup it then falls back to reports compiled-code
  // coordinates (the same fallback as the pins below).
  // Impact: on Rsbuild, a violation inside the callback of an object that
  // is only named like a server fn points at a line/column that does not
  // exist in the user's file (here 3:1 in dev, 5:42 in a build; in dev the
  // file is also named by its source-map URL, `webpack:/src/a.tsx`, the bug
  // pinned in "the reported importer is a file of the app").
  // Source: audit F-H3 (moved from analysis.usage.test.ts, which followed
  // the Vite order).
  test.fails.each(rows(['lookAlike'], ['rsbuild dev', 'rsbuild build']))(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(await reportedLocations(channel, code), expected)
    },
    timeout,
  )

  // Bug: the original-source usage lookup, which the Rsbuild adapter tries
  // first, counts uses in type positions (`typeof secret`), which TypeScript
  // erases, and does not count a JSX element (`<Secret />`) as a use; the
  // compiled-code lookup it then falls back to reports compiled-code
  // coordinates when the module has no column source map (production builds,
  // and Rsbuild's default `cheap-module-source-map` in development).
  // Impact: on Rsbuild, the violation points at a type annotation, or at a
  // line/column that does not exist in the user's file (the JSX element in
  // dev: `webpack:/src/a.tsx:2:1`, also named by its source-map URL).
  // Source: PR #8504 (analysis.usage.test.ts "ignores type positions, which
  // TypeScript erases", "finds $name usage"); moved from the pins on the
  // internal helper (analysis.usage.test.ts).
  test.fails.each(
    rows(['typePosition', 'jsxElement'], ['rsbuild dev', 'rsbuild build']),
  )(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(await reportedLocations(channel, code), expected)
    },
    timeout,
  )

  // Bug (Rsbuild): the original-source usage lookup, which the Rsbuild
  // adapter tries first, skips only functions passed directly to a
  // compiler-safe boundary call (`isInsideCompilerSafeBoundaryNodes`,
  // import-protection/analysis.ts), but the client compile removes the
  // whole `createServerOnlyFn(...)` call, whatever its argument (here a
  // function wrapped in `wrap(...)`), so the use inside it never runs in
  // the client; the lookup reports it (src/a.tsx:5:48) instead of the leak
  // on line 6.
  // Impact: on Rsbuild, the violation points at code the client never runs,
  // not at the leak (location only).
  // Source: mutation round 3 ip-analysis pin P2, reproduced on a real app
  // (V1 ip S26; the internal pin on the lookup is removed).
  //
  // Bug (Rsbuild): a dynamic import of a denied module is reported neither
  // on the line of the `import()` nor at a static import: the dev server
  // reports the first column of the module (`webpack:/src/a.tsx:1:1`, also
  // named by its source-map URL), a build compiled-code coordinates
  // (src/a.tsx:1:33, a column line 1 does not have).
  // Impact: on Rsbuild, the violation of a lazily loaded denied module
  // points at the wrong line.
  // Source: V1 ip S14 (an input shape the internal index tests had).
  test.fails.each(
    rows(
      ['wrappedBoundary', 'dynamicImport'],
      ['rsbuild dev', 'rsbuild build'],
    ),
  )(
    '$channel: $name',
    async ({ channel, code, expected }) => {
      expectRelevantLocation(await reportedLocations(channel, code), expected)
    },
    timeout,
  )
})

// Bug (Rsbuild): when the app has source maps, a location import protection
// finds in the compiled code of the importer and maps back through the
// module's source map takes its file from the map's source URL
// (`mapGeneratedToOriginal`, import-protection/sourceLocation.ts:248,
// `file: orig.source`), which Rspack names after its
// `devtoolModuleFilenameTemplate` (`webpack://<namespace>/./src/a.tsx`); the
// report prints that file in place of the importer (`formatViolation`,
// import-protection/trace.ts:203). Reachable with Rsbuild's defaults: its
// development source maps (`cheap-module-source-map`) are on, and so are
// production ones once an app sets `output.sourceMap.js`.
// Impact: the importer is named `webpack:/src/a.tsx:...`, a path that is no
// file of the app (editors and terminals do not open it), only for the
// imports found in the compiled code (here a JSX element; the same happens
// to an import `source.transformImport` rewrote). SPEC J6.5: the importer's
// location in the original source, with or without source maps.
// Source: F2 (repair A2; DECISIONS 2026-10-21), reproduced with the public
// options of an app.
describe('the reported importer is a file of the app, whatever source maps it has', () => {
  const jsx = cases.jsxElement!.code
  /** The files the reports name as the importer. */
  const reportedFiles = async (
    channel: Channel,
    options: { sourcemap?: boolean } = {},
  ) =>
    (await reportedLocations(channel, jsx, options)).map(
      (importer) => importer.split(':')[0],
    )

  // (the location itself is pinned above, "a JSX element")
  test(
    'rsbuild build without source maps: a JSX element (control)',
    async () => {
      expect(await reportedFiles('rsbuild build')).toEqual(['src/a.tsx'])
    },
    timeout,
  )

  test.fails.each([
    {
      channel: 'rsbuild dev' as const,
      name: "Rsbuild's default development source maps",
      sourcemap: false,
    },
    {
      channel: 'rsbuild build' as const,
      name: 'a build with source maps',
      sourcemap: true,
    },
  ])(
    '$channel ($name): a JSX element',
    async ({ channel, sourcemap }) => {
      expect(await reportedFiles(channel, { sourcemap })).toEqual(['src/a.tsx'])
    },
    timeout,
  )
})
