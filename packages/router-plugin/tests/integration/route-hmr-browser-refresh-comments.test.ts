/**
 * A `@refresh` comment on a statement of a split route file changes nothing
 * but what the framework's refresh reads (SPEC J2.16, R153): the statement
 * runs as often as without the comment, and a binding the loader and the
 * split component both read is one object. Where the comment applies:
 * code-splitter-refresh-placements.test.ts.
 */
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TargetFramework } from '../route-app'
import type { TestContext } from 'vitest'

const timeout = 120_000

const route = (statements: string, version: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
${statements}
export const Route = createFileRoute('/')({
  loader: () => both,
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p>page ${version} {data === both ? 'shared' : 'copied'} {String((globalThis as any).__ran)} {String((globalThis as any).__if)}</p>
}
`

/** A binding both options read, a top-level assignment and a top-level `if` with effects, an export. */
const statements = (comment: string) => `const both = { n: 1 }${comment}
;(globalThis as any).__ran = ((globalThis as any).__ran ?? 0) + 1${comment}
if (true) {${comment}
  ;(globalThis as any).__if = ((globalThis as any).__if ?? 0) + 1
}
export const meta = 1${comment}`

describe.each(['vite', 'rsbuild'] as const)(
  '%s react: statements with a @refresh comment',
  (bundler) => {
    it(
      'run as often and share their bindings as without the comment',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const run = async (comment: string) => {
          const app = await openRouteHmrPage({
            bundler,
            onTestFinished,
            files: { 'routes/index.tsx': route(statements(comment), 'v1') },
            ready: 'page v1',
          })
          const seen = [(await app.page.text('#app')).trim()]
          for (const n of [2, 3]) {
            await app.edit(
              { 'routes/index.tsx': route(statements(comment), `v${n}`) },
              `page v${n}`,
            )
            seen.push((await app.page.text('#app')).trim())
          }
          return seen
        }
        const [plain, commented] = await Promise.all([
          run(''),
          run(' /* @refresh reset */'),
        ])
        expect(plain[0]).toBe('page v1 shared 1 1')
        expect(commented).toEqual(plain)
      },
    )
  },
)

/** A declaration nothing reads whose initializer subscribes to an event: the page counts the callbacks of one event. */
const subscribing = (target: TargetFramework, comment: string) => {
  const head = `function register() {
  window.addEventListener('route-ping', () => {
    ;(window as any).__calls = ((window as any).__calls ?? 0) + 1
  })
  return () => {}
}
const unsubscribe = register()${comment}
`
  return target === 'vue'
    ? `import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
${head}const Page = defineComponent({ setup: () => () => <p>subscribed</p> })
export const Route = createFileRoute('/')({ component: Page })
`
    : `import { createFileRoute } from '@tanstack/${target}-router'
${head}export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <p>subscribed</p>
}
`
}

describe.each([
  { bundler: 'vite', target: 'react' },
  { bundler: 'vite', target: 'solid' },
  { bundler: 'vite', target: 'vue' },
  { bundler: 'rsbuild', target: 'react' },
  { bundler: 'rsbuild', target: 'solid' },
  { bundler: 'rsbuild', target: 'vue' },
] as const)(
  '$bundler $target: an unread declaration that subscribes',
  ({ bundler, target }) => {
    it(
      'subscribes once, with a @refresh comment as without it',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const calls = async (comment: string) => {
          const app = await openRouteHmrPage({
            bundler,
            target,
            onTestFinished,
            files: { 'routes/index.tsx': subscribing(target, comment) },
            ready: 'subscribed',
          })
          return app.evaluate<number>(
            `(window.dispatchEvent(new Event('route-ping')), window.__calls)`,
          )
        }
        const [plain, commented] = await Promise.all([
          calls(''),
          calls(' /* @refresh reset */'),
        ])
        expect({ plain, commented }).toEqual({ plain: 1, commented: 1 })
      },
    )
  },
)

// Review of the route HMR implementation (11-23): a type-only specifier
// under `verbatimModuleSyntax` leaves the route module with its statement;
// with a comment on the statement, the chunk must not import the module
// either
describe('vite react, verbatimModuleSyntax: an import of a type only, with a @refresh comment', () => {
  it(
    'evaluates the imported module as often as without the comment',
    { timeout },
    async ({ expect, onTestFinished }: TestContext) => {
      const evaluations = async (comment: string) => {
        const app = await openRouteHmrPage({
          onTestFinished,
          files: {
            'tsconfig.json': JSON.stringify({
              compilerOptions: { verbatimModuleSyntax: true, jsx: 'react-jsx' },
            }),
            'kinds.ts': `;(globalThis as any).__kinds = ((globalThis as any).__kinds ?? 0) + 1
export type Kind = 'page'
`,
            'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
${comment}import { type Kind } from '../kinds'
const kind: Kind = 'page'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <p>shown {kind}</p>
}
`,
          },
          ready: 'shown page',
        })
        return app.evaluate<number | null>('globalThis.__kinds ?? null')
      }
      const [plain, commented] = await Promise.all([
        evaluations(''),
        evaluations('/* @refresh reset */\n'),
      ])
      expect(commented).toBe(plain)
    },
  )
})
