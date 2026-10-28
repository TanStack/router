// Slow-tier half of this suite: the tests that need a real tool. Its
// page tests are in pages/code-splitter-imports-exports.test.ts.
import { describe, expect, it } from 'vitest'
import { build, head, routeApp } from '../build-harness'

describe('TypeScript-only syntax', () => {
  // With `verbatimModuleSyntax`, TypeScript keeps `import { type Db } from
  // './db'` as `import './db'`. A module a route file imports only for types
  // need not load in the client (SPEC J2.5; same as the Start
  // client in start-plugin-core known-bugs-start-compiler.test.ts "a
  // server-only module imported only for a type specifier"). Only Vite reads
  // the app's tsconfig in this harness.
  describe('a module imported only for a type specifier, with verbatimModuleSyntax (vite)', () => {
    const files = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { verbatimModuleSyntax: true, jsx: 'react-jsx' },
      }),
      'db.ts': `;(globalThis as any).dbLoaded = 'MARK_DB_LOADED_END'
export type Db = { name: string }
`,
    }
    const route = `${head}import { type Db } from '../db'
function Page(props: { db?: Db }) {
  return <p>{props.db ? props.db.name : 'page'}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`

    it('does not load in the client of a split route file, which renders', async () => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(route, { env: 'client', files }),
      })
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)
return globalThis.dbLoaded ?? null`,
      )
      expect({
        where: app.where('MARK_DB_LOADED_END'),
        loaded: run.result,
        html: run.html,
      }).toEqual({
        where: 'nowhere',
        loaded: null,
        html: '<div id="root"><p>page</p></div>',
      })
    }, 60_000)
  })

  // Source: real app statelyai/jevspresso (diff corpus): `import type { Bar }`
  // next to a component `function Bar`. TypeScript allows a type-only import
  // and a value of the same name. The type-only declaration stays type-only in
  // the route module whatever specifiers it keeps: with `verbatimModuleSyntax`
  // a plain `import { Label }` is a runtime import of a type the module does
  // not export, and the build fails.
  describe('a type-only import whose name a split component also declares, with verbatimModuleSyntax (vite)', () => {
    const files = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { verbatimModuleSyntax: true, jsx: 'react-jsx' },
      }),
      'labels.ts': `export type Badge = { name: string }
export type Label = string
`,
    }
    const route = `${head}import type { Badge, Label } from '../labels'
export type Kept = Label
function Badge() {
  return <p>MARK_BADGE</p>
}
function Page() {
  return <Badge />
}
export const Route = createFileRoute('/')({ component: Page })
`

    it('builds a split route file, which renders', async () => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(route, { env: 'client', files }),
      })
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)`,
      )
      expect(run.html).toBe('<div id="root"><p>MARK_BADGE</p></div>')
    }, 60_000)
  })

  // The neighbouring forms, each next to a component of the same name that
  // moves to the chunk: `import type { X }`, `import type X from`, an inline
  // `{ type X, y }`, and a type-only namespace import (TypeScript rejects a
  // value of the namespace's name). Modules imported only for types never
  // load in the client, whatever the app's tsconfig.
  describe.each([
    ['verbatimModuleSyntax', { verbatimModuleSyntax: true }],
    ['isolatedModules', { isolatedModules: true }],
    ['default options', {}],
  ])(
    'type-only imports next to split components, with %s (vite)',
    (_, options) => {
      const loaded = (name: string) =>
        `;((globalThis as any).typesLoaded ??= []).push('${name}')\n`
      const files = {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { ...options, jsx: 'react-jsx' },
        }),
        'labels.ts': `${loaded('labels')}export type Badge = { name: string }
export type Label = string
`,
        'chip.ts': `${loaded('chip')}type Chip = { size: number }
export type { Chip as default }
`,
        'tags.ts': `${loaded('tags')}export type Tag = string
`,
        'pills.ts': `export type Pill = { color: string }
export const pillText = 'MARK_PILL'
`,
      }
      const route = `${head}import type { Badge, Label } from '../labels'
import type Chip from '../chip'
import type * as Tags from '../tags'
import { type Pill, pillText } from '../pills'
export type Kept = Label | Tags.Tag
function Badge() {
  return <b>MARK_BADGE</b>
}
function Chip() {
  return <i>MARK_CHIP</i>
}
function Pill() {
  return <s>{pillText}</s>
}
function Page(props: { tag?: Tags.Tag }) {
  return (
    <p>
      <Badge />
      <Chip />
      <Pill />
      {props.tag}
    </p>
  )
}
export const Route = createFileRoute('/')({ component: Page })
`

      it('builds a split route file, which renders without loading them', async () => {
        const app = await build({
          bundler: 'vite',
          env: 'client',
          files: routeApp(route, { env: 'client', files }),
        })
        const run = await app.run(
          `await entry.mount(entry.Route.options.component)
return globalThis.typesLoaded ?? null`,
        )
        expect({ loaded: run.result, html: run.html }).toEqual({
          loaded: null,
          html: '<div id="root"><p><b>MARK_BADGE</b><i>MARK_CHIP</i><s>MARK_PILL</s></p></div>',
        })
      }, 60_000)
    },
  )
})
