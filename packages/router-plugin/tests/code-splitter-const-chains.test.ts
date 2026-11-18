/**
 * Route option values named through module-level `const`s: a spread in the
 * options object reads the same through a chain of unwritten consts as
 * written inline.
 */
import { describe, expect, it } from 'vitest'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'

import { expectValidModules, head, loadRoute } from './route-app'
import type { DeletableNodes } from '../src'

/** Start's client list of `deleteNodes`. */
const deleteNodes: Array<DeletableNodes> = ['ssr', 'server', 'headers']

const files = {
  'admin-helper.ts': `export const readSecret = () => 'MARK_HELPER_SECRET'\n`,
}

const page = `component: () => <p>MARK_PAGE</p>,
  server: { handlers: { GET: () => readSecret() } },`

describe('a spread in route options naming a chain of consts', () => {
  it('holding none of deleteNodes, removes them, nothing reported', async () => {
    const route = await loadRoute(
      `${head}import { readSecret } from './admin-helper'
const a = { staleTime: 1 }
const base = a
export const Route = createFileRoute('/x')({
  ...base,
  ${page}
})
`,
      { routeId: '/x', files, deleteNodes, fresh: true },
    )
    await expectValidModules(route)
    expect(await route.requested()).not.toContain('/admin-helper.ts')
    const [server, staleTime] = await route.run<[boolean, number]>(
      `return ['server' in options, options.staleTime]`,
    )
    expect([server, staleTime]).toEqual([false, 1])
    expectNoProblems(await route.diagnostics())
  })
})
