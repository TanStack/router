/**
 * Start's Rsbuild `build --watch` with RSC, a server function whose only
 * caller an edit removed: the page's loader calls `fn1` of `fn0.ts`, a
 * server function whose handler calls `fn1` of `fn1.ts`; an edit turns
 * `fn0.ts`'s `fn1` into a plain function. The rebuild serves what a cold
 * build of the edited source serves: `fn1.ts`'s function is in no server
 * output. The resolver the compilation started with still imports its
 * provider, but that import is no caller (rule 2 of the Rsbuild host: a
 * function needs a real caller). The same for a server function whose last
 * client call an edit removed: its provider's own record is no caller.
 * Source: design-rsc-phase1-settlement.md §9 fact 14 (an accepted limit
 * until the registry was grounded, hotspot 3).
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildRscLinks } from '../../start-plugins'
import { rscAppFiles } from '../rsc-warning-app'

const files = {
  ...rscAppFiles,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { fn1 } from '../fn0'
export const Route = createFileRoute('/')({
  loader: async () => ({ value: await fn1() }),
  component: Home,
})
function Home() {
  return <main>{Route.useLoaderData().value}</main>
}
`,
  'src/fn0.ts': `import { createServerFn } from '@tanstack/react-start'
import { fn1 as next } from './fn1'
export const fn1 = createServerFn().handler(() => next())
`,
  'src/fn1.ts': `import { createServerFn } from '@tanstack/react-start'
export const fn1 = createServerFn().handler(() => 'MARK_DEEP_VALUE')
`,
  'src/entry.ts': `export {}\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
}
const plainFn0 = `export const fn1 = () => 'MARK_REMOVED_FN_1'\n`

describe('rsbuild build --watch with RSC: a server function whose only caller an edit removed', () => {
  test('the rebuild has the function in no server output, as a cold build of the edited source', async () => {
    const options = {
      bundler: 'rsbuild' as const,
      entry: 'src/entry.ts',
      symlinks: rsbuildRscLinks(),
      start: { rsc: { enabled: true } } as never,
    }
    const cold = await buildStart({
      ...options,
      files: { ...files, 'src/fn0.ts': plainFn0 },
    })
    const coldDeep = cold.ssr.locate('MARK_DEEP_VALUE')
    expect([...coldDeep.eager, ...coldDeep.lazy]).toEqual([])

    const watched = await buildStart({
      ...options,
      files,
      watchEdits: [{ edits: { 'src/fn0.ts': plainFn0 } }],
    })
    const removed = watched.ssr.locate('MARK_REMOVED_FN_1')
    expect([...removed.eager, ...removed.lazy].length).toBeGreaterThan(0)
    const deep = watched.ssr.locate('MARK_DEEP_VALUE')
    expect([...deep.eager, ...deep.lazy]).toEqual([])
  })

  test('the last client call of a server function removed: the rebuild has it in no server output', async () => {
    const withCall = `import { createFileRoute } from '@tanstack/react-router'
import { fn1 } from '../fn1'
export const Route = createFileRoute('/')({
  loader: async () => ({ value: await fn1() }),
  component: Home,
})
function Home() {
  return <main>{Route.useLoaderData().value}</main>
}
`
    const withoutCall = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => <main>MARK_NO_CALL</main>,
})
`
    const watched = await buildStart({
      bundler: 'rsbuild',
      entry: 'src/entry.ts',
      symlinks: rsbuildRscLinks(),
      start: { rsc: { enabled: true } } as never,
      files: { ...files, 'src/routes/index.tsx': withCall },
      watchEdits: [{ edits: { 'src/routes/index.tsx': withoutCall } }],
    })
    const page = watched.ssr.locate('MARK_NO_CALL')
    expect([...page.eager, ...page.lazy].length).toBeGreaterThan(0)
    const deep = watched.ssr.locate('MARK_DEEP_VALUE')
    expect([...deep.eager, ...deep.lazy]).toEqual([])
  })
})
