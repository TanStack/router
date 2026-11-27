/**
 * A route file's `codeSplitGroupings` edit that moves its component to
 * another split chunk, or out of the split and back, each save with a body
 * edit, then a body edit: every save shows (SPEC J3.2, J3.3).
 *
 * React and Vue update in place. Solid reloads the page on a move:
 * solid-refresh patches per module, from the first proxy a module registered
 * under a name, and stops patching a module that lost a component
 * (https://github.com/solidjs/solid-refresh/issues/88), so the router cannot
 * follow the component in place.
 * Bug: the router kept the proxy it held (the new chunk's has the same name
 * and file), which no module patched any more. Impact: on Solid, no save
 * showed from the move on, until a reload (main showed the moving save,
 * then went stale too).
 */
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const timeout = 90_000

type Target = 'react' | 'solid' | 'vue'

const route = (target: Target, groupings: string, version: number) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  codeSplitGroupings: ${groupings},
  loader: () => 'data',
  component: Page,
})
function Page() {
  return <p>page v${version}</p>
}
`

const apart = `[['loader'], ['component']]`

describe.each([
  { bundler: 'vite', target: 'react' },
  { bundler: 'vite', target: 'solid' },
  { bundler: 'vite', target: 'vue' },
  { bundler: 'rsbuild', target: 'react' },
  { bundler: 'rsbuild', target: 'solid' },
  { bundler: 'rsbuild', target: 'vue' },
] as const)('$bundler: a $target app', ({ bundler, target }) => {
  it.for([
    { name: 'to the loader chunk', moved: `[['loader', 'component']]` },
    { name: 'out of the split', moved: `[]` },
  ])(
    'the component moves $name and back, each move and the next save editing its body',
    { timeout },
    async ({ moved }, { expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        bundler,
        target,
        onTestFinished,
        files: { 'routes/index.tsx': route(target, apart, 1) },
        ready: 'page v1',
      })
      const saves: Array<[groupings: string, move: boolean]> = [
        [moved, true],
        [moved, false],
        [apart, true],
        [apart, false],
        [moved, true],
        [moved, false],
      ]
      for (const [i, [groupings, move]] of saves.entries()) {
        const v = i + 2
        expect(
          await app.edit(
            { 'routes/index.tsx': route(target, groupings, v) },
            `page v${v}`,
          ),
          `save v${v}`,
        ).toEqual({ reloaded: move && target === 'solid', errors: [] })
      }
    },
  )
})
