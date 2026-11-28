/**
 * What a build reports of a violation, and the fixes its report suggests,
 * applied (R101: a message fires where the problem is, and the fix it gives
 * works). Real Vite and Rsbuild builds of a Start app; diagnostics are
 * checked by severity, file and position only (the wording is not).
 *
 * - every surviving violation is reported, not only the first;
 * - a pattern import (`import.meta.glob`) of a denied file is reported at
 *   the pattern import; its suggested fix, a negative pattern, leaves the
 *   file out;
 * - a server render of a browser-only (`*.client.*`) component is
 *   reported at its import (also as a route option through `Widget<P>` or
 *   `UI?.Widget`); the suggested fix, rendering it inside `<ClientOnly>`
 *   (React and Solid, `<UI.Widget />` for a namespace member), builds, and
 *   the server output has none of the component;
 * - a module importing both markers fails at the second marker;
 * - a `require()` of a denied file is reported at the call, as the import it
 *   is (review round 2 F4-1: Rsbuild and Vite named it an import another
 *   plugin added, without a position); its fix, the call inside
 *   `createServerOnlyFn` or a server function's handler, keeps the file out of
 *   the client; a webpack context written through a cast of `import.meta`
 *   (Rsbuild) is reported at the context (of two, the one reading the
 *   file's directory), and narrowing its `regExp` leaves the file out.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  expectNoDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { startBundlers } from '../../build-harness'
import { buildStart } from '../../build-start'
import {
  expectViolationsAt,
  rejection,
} from '../../importProtection/start-apps'
import { solidAppConfig } from '../hydrate-pages'

/** A denied file whose code a bundle holding it shows (`MARK_DB`). */
const db = `export const db = () => 'MARK_DB'\n`

/** A browser-only component (its code: `MARK_WIDGET`). */
const widget = `export function Widget() {
  return <span data-mark="MARK_WIDGET">{window.location.host}</span>
}
`

describe.each(startBundlers)('%s build', (bundler) => {
  test('every surviving violation fails the build and is printed, not only the first', async () => {
    const error = await rejection(
      buildStart({
        bundler,
        files: {
          'src/lib/db.server.ts': db,
          'src/lib/other.server.ts': `export const other = () => 'MARK_OTHER'\n`,
          'src/a.ts': `import { db } from './lib/db.server'\nexport const a = () => db()\n`,
          'src/entry.ts': `import { a } from './a'
import { other } from './lib/other.server'
export const read = () => [a(), other()]
`,
        },
        entry: 'src/entry.ts',
      }),
    )
    // (`expectViolationsAt` also checks each is printed as an error at its position)
    expectViolationsAt(error, [
      { environment: 'client', use: 'src/a.ts:1:20' },
      { environment: 'client', use: 'src/entry.ts:2:23' },
    ])
  })

  const globbing = (patterns: string) => ({
    'src/lib/db.server.ts': db,
    'src/lib/util.ts': `export const util = () => 'util'\n`,
    'src/entry.ts': `const modules = import.meta.glob(${patterns}, { eager: true })
export const read = () => Object.keys(modules)
`,
  })

  // Every form of the call: a list of patterns (with a negation of another
  // file), type arguments, and a commented-out call before it.
  test.each([
    {
      name: 'one pattern',
      call: `import.meta.glob('./lib/*.ts', { eager: true })`,
    },
    {
      name: 'a list of patterns',
      call: `import.meta.glob(['./lib/*.ts', '!./lib/util.ts'], { eager: true })`,
    },
    {
      name: 'type arguments',
      call: `import.meta.glob<{ db?: () => string }>('./lib/*.ts', { eager: true })`,
    },
    {
      name: 'a commented-out call before it',
      head: `// import.meta.glob('./other/*.ts')\n/* import.meta.glob('./other/*.ts') */\n`,
      call: `import.meta.glob('./lib/*.ts', { eager: true })`,
    },
  ])(
    "a pattern import of a denied file fails the build at the importer's pattern import ($name)",
    async ({ call, head = '' }) => {
      const entry = `${head}const modules = ${call}
export const read = () => Object.keys(modules)
`
      const error = await rejection(
        buildStart({
          bundler,
          files: { ...globbing(`'./lib/*.ts'`), 'src/entry.ts': entry },
          entry: 'src/entry.ts',
        }),
      )
      const { line, column } = diagnosticPosition(
        entry,
        entry.lastIndexOf('import.meta.glob'),
      )
      expectViolationsAt(error, [
        { environment: 'client', use: `src/entry.ts:${line}:${column}` },
      ])
    },
  )

  test('a negative pattern naming the denied file leaves it out: no violation, and the client has none of it', async () => {
    const build = await buildStart({
      bundler,
      files: globbing(`['./lib/*.ts', '!./lib/db.server.ts']`),
      entry: 'src/entry.ts',
    })
    expect(build.violations).toEqual([])
    expect(build.client.where('MARK_DB')).toBe('nowhere')
    const { result } = await build.client.run('return entry.read()')
    expect(result).toEqual(['./lib/util.ts'])
  })

  // A denied file whose name holds glob metacharacters (file-routed
  // content: `[draft]`, `{draft}`, `(1)`): the negative pattern the report
  // prints, applied as printed, leaves that file out and keeps its
  // siblings, among them one the unescaped name would match as a pattern
  // (`d.server.ts`, exempt here). Rspack reads no `\(` (the parenthesised
  // name: a parenthesis the report writes for both bundlers). Source:
  // fact-check of the Astra review round 3 of #8817, import protection B3
  // (`'!./cards/[draft].server.ts'` was printed, a character class, and the
  // build still failed).
  test.each([
    '[draft].server.ts',
    '{draft}.server.ts',
    '@draft(1)+v.server.ts',
  ])(
    'the negative pattern printed for a pattern import of %s, applied as printed, leaves the file out',
    async (denied) => {
      const files = (patterns: string) => ({
        [`src/cards/${denied}`]: `export const draft = () => 'MARK_DRAFT'\n`,
        'src/cards/d.server.ts': `export const d = 'd'\n`,
        'src/cards/index.ts': `export const list = 'list'\n`,
        'src/entry.ts': `const modules = import.meta.glob(${patterns}, { eager: true })
export const read = () => Object.keys(modules).sort()
`,
      })
      const start = {
        importProtection: { client: { excludeFiles: ['**/d.server.ts'] } },
      }
      const error = await rejection(
        buildStart({
          bundler,
          files: files(`'./cards/*.ts'`),
          entry: 'src/entry.ts',
          start,
        }),
      )
      expectViolationsAt(error, [
        { environment: 'client', use: 'src/entry.ts:1:17' },
      ])
      // the suggested call's patterns, as the report prints them (a
      // JavaScript list of string literals)
      const printed = error.diagnostics
        .map(({ text }) =>
          /import\.meta\.glob\((\[[^\n]*\]), \.\.\.\)/.exec(text),
        )
        .find(Boolean)
      expect(printed).toBeTruthy()
      const build = await buildStart({
        bundler,
        files: files(printed![1]!),
        entry: 'src/entry.ts',
        start,
      })
      expect(build.violations).toEqual([])
      expect(build.client.where('MARK_DRAFT')).toBe('nowhere')
      const { result } = await build.client.run('return entry.read()')
      expect(result).toEqual(['./cards/d.server.ts', './cards/index.ts'])
    },
  )

  const required = (load: string) => ({
    'src/lib/db.server.ts': db,
    'src/entry.ts': `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
declare const require: any
export const load = ${load}
`,
  })

  test('a require() of a denied file fails the build at the call, as the import it is', async () => {
    const error = await rejection(
      buildStart({
        bundler,
        files: required(`() => require('./lib/db.server').db()`),
        entry: 'src/entry.ts',
      }),
    )
    expectViolationsAt(error, [
      { environment: 'client', use: 'src/entry.ts:3:27' },
    ])
  })

  test.each([
    [
      'createServerOnlyFn',
      `createServerOnlyFn(() => require('./lib/db.server').db())`,
    ],
    [
      "a server function's handler",
      `createServerFn().handler(async () => require('./lib/db.server').db())`,
    ],
  ])(
    'the require() inside %s builds, and the client has none of the file',
    async (_, load) => {
      const build = await buildStart({
        bundler,
        files: required(load),
        entry: 'src/entry.ts',
      })
      expect(build.violations).toEqual([])
      expect(build.client.where('MARK_DB')).toBe('nowhere')
      expect(build.ssr.where('MARK_DB')).not.toBe('nowhere')
    },
  )

  const context = (regExp: string) => ({
    'src/lib/db.server.ts': db,
    'src/lib/util.ts': `export const util = () => 'util'\n`,
    'src/entry.ts': `const ctx = (import.meta as any).webpackContext('./lib', { recursive: false, regExp: ${regExp} })
export const read = () => ctx.keys()
`,
  })

  test.runIf(bundler === 'rsbuild')(
    'a webpack context through a cast of import.meta fails the build at the context, and a narrower regExp leaves the file out',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: context('/\\.ts$/'),
          entry: 'src/entry.ts',
        }),
      )
      expectViolationsAt(error, [
        { environment: 'client', use: 'src/entry.ts:1:14' },
      ])
      const build = await buildStart({
        bundler,
        files: context('/util\\.ts$/'),
        entry: 'src/entry.ts',
      })
      expect(build.violations).toEqual([])
      expect(build.client.where('MARK_DB')).toBe('nowhere')
      const { result } = await build.client.run('return entry.read()')
      expect(result).toEqual(['./util.ts'])
    },
  )

  // Two contexts of one module: the report is at the one whose directory
  // holds the denied file, so narrowing the context it names is the fix.
  // Source: Astra review of #8817, import protection B5 (the first context
  // was reported, and narrowing it still failed).
  test.runIf(bundler === 'rsbuild')(
    'of two webpack contexts, the one reading the directory of the denied file fails the build, and narrowing its regExp leaves the file out',
    async () => {
      const entry = (
        regExp: string,
      ) => `const locales = (import.meta as any).webpackContext('./locales', { recursive: false, regExp: /\\.ts$/ })
const lib = (import.meta as any).webpackContext('./lib', { recursive: false, regExp: ${regExp} })
export const read = () => [...locales.keys(), ...lib.keys()]
`
      const files = (regExp: string) => ({
        'src/locales/en.ts': `export const en = 'en'\n`,
        'src/lib/db.server.ts': db,
        'src/lib/util.ts': `export const util = () => 'util'\n`,
        'src/entry.ts': entry(regExp),
      })
      const error = await rejection(
        buildStart({
          bundler,
          files: files('/\\.ts$/'),
          entry: 'src/entry.ts',
        }),
      )
      const text = entry('/\\.ts$/')
      const { line, column } = diagnosticPosition(
        text,
        text.lastIndexOf('import.meta'),
      )
      expectViolationsAt(error, [
        { environment: 'client', use: `src/entry.ts:${line}:${column}` },
      ])
      const build = await buildStart({
        bundler,
        files: files('/util\\.ts$/'),
        entry: 'src/entry.ts',
      })
      expect(build.violations).toEqual([])
      expect(build.client.where('MARK_DB')).toBe('nowhere')
    },
  )

  // webpack's own form of the context
  test.runIf(bundler === 'rsbuild')(
    'a require.context of a denied file fails the build at the context',
    async () => {
      const entry = `declare const require: any
const ctx = require.context('./lib', false, /\\.ts$/)
export const read = () => ctx.keys()
`
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/lib/db.server.ts': db,
            'src/lib/util.ts': `export const util = () => 'util'\n`,
            'src/entry.ts': entry,
          },
          entry: 'src/entry.ts',
        }),
      )
      const { line, column } = diagnosticPosition(entry, 'require.context')
      expectViolationsAt(error, [
        { environment: 'client', use: `src/entry.ts:${line}:${column}` },
      ])
    },
  )

  test.each([
    { name: 'an import', second: `import '@tanstack/react-start/client-only'` },
    {
      name: 'a re-export',
      second: `export * from '@tanstack/react-start/client-only'`,
    },
  ])(
    'a marker conflict fails the build at the second marker ($name)',
    async ({ second }) => {
      const both = `import '@tanstack/react-start/server-only'
${second}
export const both = 1
`
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/both.ts': both,
            'src/entry.ts': `import { both } from './both'\nexport const read = () => both\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      const conflict = expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file: 'src/both.ts',
        root: error.root,
        position: diagnosticPosition(
          both,
          `'@tanstack/react-start/client-only'`,
        ),
      })
      // the first marker, as the position of a denial names it
      // (diagnostics spike, 2026-11-24, inventory flag 9)
      const first = diagnosticPosition(
        both,
        `'@tanstack/react-start/server-only'`,
      )
      expect(conflict.text).toContain(
        `"@tanstack/react-start/server-only" (src/both.ts:${first.line}:${first.column})`,
      )
    },
  )

  // The report names where the marked module imports its marker, not a
  // quoted mention of it in a comment before (Astra review of #8817,
  // hydrate #14: it reported the comment's line).
  test('a marker violation reports the marker import of the marked module, not a mention in a comment', async () => {
    const marked = `// a file that imports '@tanstack/react-start/client-only' is client-only
import { useState } from 'react'
import '@tanstack/react-start/client-only'
export const useCount = () => useState(0)
`
    const error = await rejection(
      buildStart({
        bundler,
        files: {
          'src/count.ts': marked,
          'src/entry.ts': `import { useCount } from './count'\nexport const read = () => useCount\n`,
        },
        entry: 'src/entry.ts',
      }),
    )
    expectDiagnostic(error.diagnostics, {
      severity: 'error',
      file: 'src/count.ts',
      root: error.root,
      position: diagnosticPosition(
        marked,
        marked.lastIndexOf(`'@tanstack/react-start/client-only'`),
      ),
    })
  })

  describe.each([
    { framework: 'react' as const, config: {} },
    { framework: 'solid' as const, config: solidAppConfig },
  ])('$framework', ({ framework, config }) => {
    const router = `@tanstack/${framework}-router`

    test('a server render of a *.client.* component fails the build at its import', async () => {
      const error = await rejection(
        buildStart({
          bundler,
          framework,
          ...config,
          files: {
            'src/widget.client.tsx': widget,
            'src/entry.tsx': `import { Widget } from './widget.client'
export const Page = () => <div><Widget /></div>
`,
          },
          entry: 'src/entry.tsx',
        }),
      )
      expectViolationsAt(error, [
        { environment: 'server', use: 'src/entry.tsx:1:24' },
      ])
    })

    test.each([
      {
        use: 'as an element',
        page: `export const Page = () => (
  <div>
    <ClientOnly fallback={<span>loading</span>}>
      <Widget />
    </ClientOnly>
  </div>
)`,
      },
      {
        use: 'as a route option',
        page: `export const options = {
  component: () => (
    <ClientOnly fallback={<span>loading</span>}>
      <Widget />
    </ClientOnly>
  ),
}`,
      },
    ])(
      'rendered $use inside <ClientOnly>, it builds and only the client has the component',
      async ({ page }) => {
        const build = await buildStart({
          bundler,
          framework,
          ...config,
          files: {
            'src/widget.client.tsx': widget,
            'src/entry.tsx': `import { ClientOnly } from '${router}'
import { Widget } from './widget.client'
${page}
`,
          },
          entry: 'src/entry.tsx',
        })
        expect(build.violations).toEqual([])
        expect(build.ssr.where('MARK_WIDGET')).toBe('nowhere')
        expect(build.client.where('MARK_WIDGET')).not.toBe('nowhere')
      },
    )
  })

  // React only below: the analysis choosing the suggestion is the same for
  // every framework. A route option's value through what passes it on
  // unchanged: the report suggests `<ClientOnly>` (the fixes above and
  // below), not `createClientOnlyFn`
  test.each([
    {
      value: 'an instantiation expression',
      module: `import { Widget } from './widget.client'
export const options = { component: Widget<{}> }
`,
      use: 'src/entry.tsx:1:24',
    },
    {
      value: 'an optional chain',
      module: `import * as UI from './widget.client'
export const options = { component: UI?.Widget }
`,
      use: 'src/entry.tsx:1:21',
    },
  ])(
    'a server render of a *.client.* component as a route option through $value fails the build at its import',
    async ({ module, use }) => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/widget.client.tsx': widget,
            'src/entry.tsx': module,
          },
          entry: 'src/entry.tsx',
        }),
      )
      expectViolationsAt(error, [{ environment: 'server', use }])
    },
  )

  test('rendered as a namespace member in a route option inside <ClientOnly>, it builds and only the client has the component', async () => {
    const build = await buildStart({
      bundler,
      files: {
        'src/widget.client.tsx': widget,
        'src/entry.tsx': `import { ClientOnly } from '@tanstack/react-router'
import * as UI from './widget.client'
export const options = {
  component: () => (
    <ClientOnly fallback={<span>loading</span>}>
      <UI.Widget />
    </ClientOnly>
  ),
}
`,
      },
      entry: 'src/entry.tsx',
    })
    expect(build.violations).toEqual([])
    expect(build.ssr.where('MARK_WIDGET')).toBe('nowhere')
    expect(build.client.where('MARK_WIDGET')).not.toBe('nowhere')
  })

  // A component rendered in code the server output erases (the body of
  // `createClientOnlyFn`) and as a route option: the report names the
  // option, the use the server renders, and wrapping it builds. Source:
  // fact-check of the Astra review round 3 of #8817, import protection B2
  // (the report named the erased element, and wrapping it still failed).
  test('a component rendered in erased client-only code and as a route option: the report names the option, and wrapping it builds', async () => {
    const entry = (
      errorComponent: string,
    ) => `import { ClientOnly } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { Widget } from './widget.client'
export const preview = createClientOnlyFn(() => <Widget />)
export const options = { errorComponent: ${errorComponent} }
`
    const initial = entry('Widget')
    const error = await rejection(
      buildStart({
        bundler,
        files: { 'src/widget.client.tsx': widget, 'src/entry.tsx': initial },
        entry: 'src/entry.tsx',
      }),
    )
    expectViolationsAt(error, [
      { environment: 'server', use: 'src/entry.tsx:3:24' },
    ])
    const at = (needle: number) => ({
      severity: 'error' as const,
      file: 'src/entry.tsx',
      root: error.root,
      position: diagnosticPosition(initial, needle),
    })
    expectDiagnostic(error.diagnostics, at(initial.lastIndexOf('Widget')))
    expectNoDiagnostic(
      error.diagnostics,
      at(initial.indexOf('Widget', initial.indexOf('<'))),
    )
    const build = await buildStart({
      bundler,
      files: {
        'src/widget.client.tsx': widget,
        'src/entry.tsx': entry(
          '() => <ClientOnly fallback={<span>loading</span>}><Widget /></ClientOnly>',
        ),
      },
      entry: 'src/entry.tsx',
    })
    expect(build.violations).toEqual([])
    expect(build.ssr.where('MARK_WIDGET')).toBe('nowhere')
    expect(build.client.where('MARK_WIDGET')).not.toBe('nowhere')
  })
})
