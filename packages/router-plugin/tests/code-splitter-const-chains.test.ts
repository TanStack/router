/**
 * Route option values named through module-level `const`s (design 5 I4):
 * naming a value through one or several unwritten `const`s, or wrapping it
 * in `as`, changes neither the split nor what is reported. The options
 * object, a spread in it and an object-form loader read the same through a
 * chain of consts as written inline; a chain whose object is written to, or
 * shared with other code, keeps the warning the inline form gets.
 */
import { describe, expect, it } from 'vitest'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { expectValidModules, head, loadRoute } from './route-app'
import type { DeletableNodes } from '../src'

/** Start's client list of `deleteNodes`. */
const deleteNodes: Array<DeletableNodes> = ['ssr', 'server', 'headers']

const files = {
  'admin-helper.ts': `export const readSecret = () => 'MARK_HELPER_SECRET'\n`,
}

const page = `component: () => <p>MARK_PAGE</p>,
  server: { handlers: { GET: () => readSecret() } },`

describe('route options named through a chain of consts', () => {
  // Bug: only one `const` is followed; through two, the options are not
  // read (`options-opaque`), so nothing is split or removed (design 5 D8)
  it.for([
    {
      name: 'two consts',
      declarations: `const a = {\n  ${page}\n}\nconst options = a`,
    },
    {
      name: 'a const holding another in a cast',
      declarations: `const a = {\n  ${page}\n}\nconst options = a as any`,
    },
  ])(
    'are split and lose the options of deleteNodes, through $name, nothing reported',
    { fails: true },
    async ({ declarations }) => {
      const route = await loadRoute(
        `${head}import { readSecret } from './admin-helper'
${declarations}
export const Route = createFileRoute('/x')(options)
`,
        { routeId: '/x', files, deleteNodes, fresh: true },
      )
      await expectValidModules(route)
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.requested()).not.toContain('/admin-helper.ts')
      const [server, html] = await route.run<[boolean, string]>(
        `return ['server' in options, await renderRoute()]`,
      )
      expect(server).toBe(false)
      expect(html).toContain('MARK_PAGE')
      expectNoProblems(await route.diagnostics())
    },
  )

  it('are reported when the object the chain names is written to', async () => {
    const route = await loadRoute(
      `${head}import { readSecret } from './admin-helper'
const a: Record<string, unknown> = {
  ${page}
}
const options = a
a.staleTime = 1
export const Route = createFileRoute('/x')(options)
`,
      { routeId: '/x', files, deleteNodes, fresh: true },
    )
    await expectValidModules(route)
    expect(await route.run(`return renderRoute()`)).toContain('MARK_PAGE')
    expectDiagnostic(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    })
  })
})

describe('a spread in route options naming a chain of consts', () => {
  // Bug: only one `const` is followed; through two, the spread may hold
  // `server` for all the compiler knows (`options-unread`) (design 5 D8)
  it.fails(
    'holding none of deleteNodes, removes them, nothing reported',
    async () => {
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
    },
  )

  it('is reported when other code shares the object', async () => {
    const route = await loadRoute(
      `${head}import { readSecret } from './admin-helper'
const a = { staleTime: 1 }
const base = a
export const defaults = a
export const Route = createFileRoute('/x')({
  ...base,
  ${page}
})
`,
      { routeId: '/x', files, deleteNodes, fresh: true },
    )
    await expectValidModules(route)
    expect(await route.run(`return options.staleTime`)).toBe(1)
    expectDiagnostic(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    })
  })
})

describe('an object-form loader named through a chain of consts', () => {
  // Bug: the chunk exports the object the chain names, and the router's
  // lazy loader calls it (design 5, the Lane C leftover)
  it.fails('is split and returns its data', async () => {
    const route = await loadRoute(
      `${head}const a = { handler: () => 'MARK_DATA' }
const l = a
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: l,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`,
      { fresh: true },
    )
    await expectValidModules(route)
    expect(await route.isLazy('loader')).toBe(true)
    expect(await route.run('return renderRoute()')).toContain('MARK_DATA')
    expectNoProblems(await route.diagnostics())
  })
})
