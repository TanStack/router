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

  // Source: KNOWN-BUGS "A write to the route options through another name of
  // the object is not seen" (the literal's `server` was removed, the write
  // stayed in the client, nothing reported). The ruling: options whose
  // object, or a const of its chain, is named anywhere besides the route call
  // and the chain are not read: not split, nothing removed, reported.
  it.for([
    {
      name: 'written through another name',
      declarations: `const a: any = {
  component: () => <p>MARK_PAGE</p>,
  server: { handlers: { GET: () => 'none' } },
}
const z = a
z.server = { handlers: { GET: () => readSecret() } }`,
      options: 'a',
    },
    {
      name: 'exported',
      declarations: `const a = {\n  ${page}\n}\nexport const defaults = a`,
      options: 'a',
    },
    {
      name: 'a const of its chain named in a function',
      declarations: `const a = {\n  ${page}\n}\nconst options = a\nexport const describe = () => Object.keys(options)`,
      options: 'options',
    },
  ])(
    'are not split and reported when the object is $name',
    async ({ declarations, options }) => {
      const route = await loadRoute(
        `${head}import { readSecret } from './admin-helper'
${declarations}
export const Route = createFileRoute('/x')(${options})
`,
        { routeId: '/x', files, deleteNodes, fresh: true },
      )
      await expectValidModules(route)
      expect(await route.isLazy('component')).toBe(false)
      expect(await route.run(`return renderRoute()`)).toContain('MARK_PAGE')
      expectDiagnostic(await route.diagnostics(), {
        severity: 'warning',
        file: 'route.tsx',
        root: route.host.root,
      })
    },
  )

  it("written through another name, with the warning's fix applied (the options in the call), are split and lose the options of deleteNodes, nothing reported", async () => {
    const route = await loadRoute(
      `${head}import { readSecret } from './admin-helper'
export const Route = createFileRoute('/x')({
  component: () => <p>MARK_PAGE</p>,
  server: { handlers: { GET: () => readSecret() } },
})
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
  })

  it('named in a type only, are split, nothing reported', async () => {
    const route = await loadRoute(
      `${head}import { readSecret } from './admin-helper'
const a = {\n  ${page}\n}
const options = a
export type Options = typeof options
export const Route = createFileRoute('/x')(options)
`,
      { routeId: '/x', files, deleteNodes, fresh: true },
    )
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.requested()).not.toContain('/admin-helper.ts')
    expectNoProblems(await route.diagnostics())
  })
})

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
  it('is split and returns its data', async () => {
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

  // Source: REVIEW-design5-final finding 5 (the handler alone was split
  // out: the route lost the option written later)
  it('holding one property, keeps an option written to it later, reported', async () => {
    const route = await loadRoute(
      `${head}const a: any = { handler: () => 'MARK_DATA' }
const l = a
a.staleReloadMode = 'blocking'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: l,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`,
      { fresh: true },
    )
    await expectValidModules(route)
    expect(await route.run('return options.loader.staleReloadMode')).toBe(
      'blocking',
    )
    expect(await route.run('return renderRoute()')).toContain('MARK_DATA')
    expectDiagnostic(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    })
  })

  // Source: REVIEW-design5-final finding 6 (the chunk exported the object
  // and the route's lazy loader called it). The compiler cannot see whether
  // an import is a function or an object whose options the router reads
  // from the route module: the loader stays there, reported.
  it('imported from another module stays in the route module, returns its data, reported', async () => {
    const route = await loadRoute(
      `${head}import { l } from './loaders'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: l,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`,
      {
        fresh: true,
        files: {
          'loaders.ts': `export const l = { handler: () => 'MARK_DATA', staleReloadMode: 'blocking' }\n`,
        },
      },
    )
    await expectValidModules(route)
    expect(await route.isLazy('loader')).toBe(false)
    expect(await route.run('return options.loader.staleReloadMode')).toBe(
      'blocking',
    )
    expect(await route.run('return renderRoute()')).toContain('MARK_DATA')
    expectDiagnostic(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    })
  })
})
