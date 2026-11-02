/**
 * An annotation written after a statement, for the call next to it on the same
 * line (`const list = []; /* @__PURE__ *\/ mk()`), stays with that call when the
 * statement moves to a chunk, in real production builds: the bundler drops the
 * annotated call, and whatever follows the statement in its chunk, which the
 * annotation does not apply to, still runs. What a bundler drops is its own
 * decision, as in code-splitter-dead-code.test.ts; a page reads the effects.
 * SPEC G2, G12.
 */
import { describe, expect, test } from 'vitest'
import { build, head, routeApp } from '../build-harness'

const timeout = 60_000

const route = (
  annotation: string,
) => `${head}function mk() { (globalThis as any).annotated = 'MARK_ANNOTATED' }
const list: Array<string> = []; ${annotation} mk()
list.push('MARK_PUSHED')
const Comp = () => <p>{list.join()}</p>
export const Route = createFileRoute('/')({ component: Comp })
`

describe.each(['vite', 'rspack', 'webpack'] as const)('%s', (bundler) => {
  test.for(['/* @__PURE__ */', '/* #__PURE__ */'])(
    'after a statement that moves, %s annotates the call on its line and nothing else',
    { timeout },
    async (annotation) => {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(route(annotation), { env: 'client' }),
      })
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
return globalThis.annotated ?? null`)
      expect(run.html).toContain('MARK_PUSHED')
      expect(run.result).toBeNull()
      expect(app.where('MARK_ANNOTATED')).toBe('nowhere')
    },
  )
})
