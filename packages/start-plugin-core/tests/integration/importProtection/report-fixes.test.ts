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
 *   (Rsbuild) is reported at the context, and narrowing its `regExp` leaves
 *   the file out.
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../../build-harness'
import {
  expectViolationsAt,
  rejection,
} from '../../importProtection/start-apps'
import { solidAppConfig } from '../hydrate-pages'

const timeout = 60_000

/** A denied file whose code a bundle holding it shows (`MARK_DB`). */
const db = `export const db = () => 'MARK_DB'\n`

/** A browser-only component (its code: `MARK_WIDGET`). */
const widget = `export function Widget() {
  return <span data-mark="MARK_WIDGET">{window.location.host}</span>
}
`

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'every surviving violation fails the build and is printed, not only the first',
    async () => {
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
    },
    timeout,
  )

  const globbing = (patterns: string) => ({
    'src/lib/db.server.ts': db,
    'src/lib/util.ts': `export const util = () => 'util'\n`,
    'src/entry.ts': `const modules = import.meta.glob(${patterns}, { eager: true })
export const read = () => Object.keys(modules)
`,
  })

  test(
    "a pattern import of a denied file fails the build at the importer's pattern import",
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: globbing(`'./lib/*.ts'`),
          entry: 'src/entry.ts',
        }),
      )
      expectViolationsAt(error, [
        { environment: 'client', use: 'src/entry.ts:1:17' },
      ])
    },
    timeout,
  )

  test(
    'a negative pattern naming the denied file leaves it out: no violation, and the client has none of it',
    async () => {
      const build = await buildStart({
        bundler,
        files: globbing(`['./lib/*.ts', '!./lib/db.server.ts']`),
        entry: 'src/entry.ts',
      })
      expect(build.violations).toEqual([])
      expect(build.client.where('MARK_DB')).toBe('nowhere')
      const { result } = await build.client.run('return entry.read()')
      expect(result).toEqual(['./lib/util.ts'])
    },
    timeout,
  )

  const required = (load: string) => ({
    'src/lib/db.server.ts': db,
    'src/entry.ts': `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
declare const require: any
export const load = ${load}
`,
  })
  /** No report of `error` names a cause other than the importer's own code. */
  const noAddedImport = (error: { diagnostics?: Array<{ text: string }> }) =>
    expect(
      (error.diagnostics ?? []).filter((d) =>
        d.text.includes('another plugin'),
      ),
    ).toEqual([])

  test(
    'round 2 F4-1: a require() of a denied file fails the build at the call, as the import it is',
    async () => {
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
      noAddedImport(error)
    },
    timeout,
  )

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
    'round 2 F4-1: the require() inside %s builds, and the client has none of the file',
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
    timeout,
  )

  const context = (regExp: string) => ({
    'src/lib/db.server.ts': db,
    'src/lib/util.ts': `export const util = () => 'util'\n`,
    'src/entry.ts': `const ctx = (import.meta as any).webpackContext('./lib', { recursive: false, regExp: ${regExp} })
export const read = () => ctx.keys()
`,
  })

  test.runIf(bundler === 'rsbuild')(
    'round 2 F4-1: a webpack context through a cast of import.meta fails the build at the context, and a narrower regExp leaves the file out',
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
      noAddedImport(error)
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
    timeout,
  )

  test(
    'a marker conflict fails the build at the second marker',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files: {
            'src/both.ts': `import '@tanstack/react-start/server-only'
import '@tanstack/react-start/client-only'
export const both = 1
`,
            'src/entry.ts': `import { both } from './both'\nexport const read = () => both\n`,
          },
          entry: 'src/entry.ts',
        }),
      )
      expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file: 'src/both.ts',
        root: error.root,
        position: { line: 2, column: 8 },
      })
    },
    timeout,
  )

  describe.each([
    { framework: 'react' as const, config: {} },
    { framework: 'solid' as const, config: solidAppConfig },
  ])('$framework', ({ framework, config }) => {
    const router = `@tanstack/${framework}-router`

    test(
      'a server render of a *.client.* component fails the build at its import',
      async () => {
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
      },
      timeout,
    )

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
      timeout,
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
    timeout,
  )

  test(
    'rendered as a namespace member in a route option inside <ClientOnly>, it builds and only the client has the component',
    async () => {
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
    },
    timeout,
  )
})
