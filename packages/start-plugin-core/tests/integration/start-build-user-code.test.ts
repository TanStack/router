/**
 * User code the Start compiler does not own keeps working in real
 * production builds (SPEC J4.14, J4.17, G3, G12), through Start's Vite and
 * Rsbuild plugins (build-harness.ts):
 * - the `__NO_SIDE_EFFECTS__` annotations bundlers read still make an
 *   unused call disappear and a consumed one return its value (S28);
 * - decorators and import attributes written `assert` (V2-23);
 * - browser-only code inside the component of an `ssr: false` route next to
 *   a server fn: SSR and the server fn work without running it (S18).
 */
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'

const timeout = 60_000

/** Records each call it gets, an effect a bundler cannot see through. */
const trackModule = `export const track = (label) => {
  ;(globalThis.__tracked ??= []).push(label)
}
`

describe.each(startBundlers)('%s build', (bundler) => {
  // Bundlers drop an unused call of a function annotated
  // `__NO_SIDE_EFFECTS__` (Rolldown, Rspack): wherever the Start compiler
  // moves or keeps the declaration (the provider of a server fn, the client
  // caller), its annotation still reaches the bundler. The control module
  // has no Start API: whatever the bundler drops there it must drop next to
  // a server fn too. Each label is tracked when its call runs.
  // Source: #8504 start-compiler-preserves-user-code.test.ts; FIX-PLAN S28.
  test.each([
    {
      name: 'a function',
      declaration: (name: string) => `/* #__NO_SIDE_EFFECTS__ */
export function ${name}(label: string) {
  track(label)
  return 'label:' + label
}`,
    },
    {
      name: 'an arrow function',
      declaration: (name: string) => `/* @__NO_SIDE_EFFECTS__ */
export const ${name} = (label: string) => {
  track(label)
  return 'label:' + label
}`,
    },
  ])(
    'an unused call of $name annotated __NO_SIDE_EFFECTS__ is dropped, a consumed one runs',
    async ({ declaration }) => {
      const files = {
        'src/track.ts': trackModule,
        'src/plain.ts': `import { track } from './track'
${declaration('plainLabel')}
plainLabel('plain-unused')
export const plainUsed = () => plainLabel('plain-used')
`,
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { track } from './track'
${declaration('makeLabel')}
makeLabel('unused')
export const fn = createServerFn().handler(async () => makeLabel('handler'))
export const clientLabel = () => makeLabel('client')
`,
        'src/client-entry.ts': `export { fn, clientLabel } from './fns'
export { plainUsed } from './plain'
`,
        'src/ssr-entry.ts': `export { fn } from './fns'
export { plainUsed } from './plain'
${callByIdExports}`,
      }
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      const tracked = `[...(globalThis.__tracked ?? [])]`
      const clientRun =
        await client.run(`const values = [entry.clientLabel(), entry.plainUsed()]
return { values, tracked: ${tracked} }`)
      const ssrRun = await ssr.run(`${callByIdPrelude}const values = [
  await callById(entry.fn.serverFnMeta.id),
  entry.plainUsed(),
]
return { values, tracked: ${tracked} }`)
      // The control: the bundler drops the plain module's unused call.
      for (const run of [clientRun, ssrRun]) {
        expect(
          (run.result as { tracked: Array<string> }).tracked,
        ).not.toContain('plain-unused')
      }
      expect({ client: clientRun.result, ssr: ssrRun.result }).toEqual({
        client: {
          values: ['label:client', 'label:plain-used'],
          tracked: expect.not.arrayContaining(['unused']),
        },
        ssr: {
          values: ['label:handler', 'label:plain-used'],
          tracked: expect.not.arrayContaining(['unused']),
        },
      })
    },
    timeout,
  )

  /**
   * Builds a module with a server fn, decorated classes (TypeScript
   * `experimentalDecorators`, the form of the decorator-using libraries; the
   * handler's `Repository`, the client's `Widget`) and a JSON import written
   * with the deprecated `assert` keyword.
   */
  const decoratedApp = () => {
    const decorators = `export const tagged: Array<string> = []
export function tag(name: string) {
  return (target: unknown) => {
    tagged.push(name)
    return target
  }
}
`
    return buildStart({
      bundler,
      files: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { experimentalDecorators: true },
        }),
        'src/decorators.ts': decorators,
        'src/config.json': `{ "theme": "dark" }`,
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { tag, tagged } from './decorators'
import config from './config.json' assert { type: 'json' }

@tag('MARK_REPOSITORY')
class Repository {
  read() {
    return 'MARK_FROM_REPOSITORY'
  }
}

@tag('widget')
export class Widget {
  label() {
    return 'widget:' + config.theme
  }
}

export const fn = createServerFn().handler(async () => [
  new Repository().read(),
  config.theme,
  [...tagged].sort(),
])
`,
        'src/client-entry.ts': `export { fn, Widget } from './fns'
export { tagged } from './decorators'
`,
        'src/ssr-entry.ts': `export { fn } from './fns'
${callByIdExports}`,
      },
      entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
    })
  }

  // Every output parses and runs: the decorators run, the JSON import
  // works (`assert` reaches the bundler as `with`), the handler runs.
  // Source: FIX-PLAN V2-23 (36 corpus files with decorators); user ruling
  // D9 (`assert` stays supported).
  test(
    'a server fn module with decorated classes and an assert import attribute builds and runs',
    async () => {
      const { client, ssr } = await decoratedApp()
      expect(
        (
          await client.run(
            `return { label: new entry.Widget().label(), tagged: entry.tagged }`,
          )
        ).result,
      ).toEqual({
        label: 'widget:dark',
        // (`Repository`'s decorator may run on the client too: pinned below.)
        tagged: expect.arrayContaining(['widget']),
      })
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}return await callById(entry.fn.serverFnMeta.id)`,
          )
        ).result,
      ).toEqual([
        'MARK_FROM_REPOSITORY',
        'dark',
        // The handler's class was decorated (how often a module's top-level
        // code runs on the server is pinned elsewhere; `Widget` may go).
        expect.arrayContaining(['MARK_REPOSITORY']),
      ])
    },
    timeout,
  )

  // Bug: a class only a server fn handler uses stays in the client output
  // (dead-code elimination never removes class declarations; same root
  // cause as the pins "client: a class used by a server fn handler does
  // not load its server-only import" and "client: the server-only module of
  // a class only server code uses is not bundled"). A decorated class
  // cannot even be dropped by the bundler (its decorators run when it is
  // defined).
  // Impact: the handler's class, and what its decorators and methods
  // reference, ship to the client and run their decorators there.
  // Source: FIX-PLAN V2-23.
  test.fails(
    'the decorated class only a server fn handler uses is not in the client bundle',
    async () => {
      const { client } = await decoratedApp()
      expect(client.where('MARK_FROM_REPOSITORY')).toBe('nowhere')
    },
    timeout,
  )

  // A route with `ssr: false` whose component reads browser globals, in a
  // module that also defines a server fn: SSR renders the route without
  // running the component, the server fn answers its HTTP call, and the
  // client renders the component. (That the route module's top-level code
  // runs once per environment is the goal pinned in
  // known-bugs-start-compiler.test.ts "SSR: a server fn module is
  // initialised once ...".)
  // Source: FIX-PLAN S18 case 2 (the unconditional top-level `window` read
  // of the deleted compiler-level rows is no requirement, SPEC J4.14).
  test(
    'an ssr: false route with browser-only code in its component and a server fn',
    async () => {
      const files = {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
        'src/routes/canvas.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
export const getMessage = createServerFn().handler(async () => 'MARK_SERVER_MESSAGE')
export const Route = createFileRoute('/canvas')({
  ssr: false,
  component: CanvasPage,
})
function CanvasPage() {
  const canvas = window.document.createElement('canvas')
  return 'MARK_CANVAS_' + canvas.tagName
}
`,
        'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
        'src/client-entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
`,
        'src/ssr-entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
export { getMessage } from './routes/canvas'
${callByIdExports}`,
      }
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      const { result } = await ssr.run(`${callByIdPrelude}return {
  page: await entry.renderPath(entry.getRouter().routeTree, '/canvas'),
  message: await callById(entry.getMessage.serverFnMeta.id),
}`)
      expect(result).toEqual({
        page: expect.not.stringContaining('MARK_CANVAS'),
        message: 'MARK_SERVER_MESSAGE',
      })
      expect(
        (
          await client.run(
            `return await entry.renderPath(entry.getRouter().routeTree, '/canvas')`,
          )
        ).result,
      ).toContain('MARK_CANVAS_CANVAS')
    },
    timeout,
  )
})
