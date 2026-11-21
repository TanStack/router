/**
 * Split groupings the compiler cannot honour fail the route module with an
 * error positioned at what the route file wrote (R101): an option that
 * cannot be split, one listed twice, an imported value. Plugin options
 * with invalid groupings fail the dev server with one error. Groupings in a
 * local `const` are read. Groupings the compiler doesn't read leave the
 * route working, as on `main`: an accessor (the default groupings apply),
 * and any value when nothing is split (`autoCodeSplitting: false`).
 */
import { describe, expect, it } from 'vitest'
import {
  captureThrow,
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { head, loadRoute } from './route-app'
import type { RouteApp } from './route-app'

/** What serving the route module reports: the error it fails with, and the channel. */
async function served(route: RouteApp) {
  try {
    await route.transform()
    return await route.diagnostics()
  } catch (error) {
    return [...diagnosticsOf(error), ...(await route.diagnostics())]
  }
}

describe('codeSplitGroupings the route file writes', () => {
  it.each([
    ['an option that cannot be split', "[['loaderx'], ['component']]"],
    ['an option listed twice', "[['component'], ['component', 'loader']]"],
    ['a group that is no array', "['component']"],
  ])('fail the module at the value: %s', async (_, groupings) => {
    const code = `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: ${groupings},
  loader: () => 'data',
  component: () => <p>page</p>,
})
`
    const route = await loadRoute(code, { fresh: true })
    expectDiagnostic(await served(route), {
      severity: 'error',
      file: 'route.tsx',
      root: route.host.root,
      position: diagnosticPosition(code, groupings),
    })
  })

  it('fail the module at an imported value', async () => {
    const code = `${head}import { groupings } from './groupings'
export const Route = createFileRoute('/')({
  codeSplitGroupings: groupings,
  component: () => <p>page</p>,
})
`
    const route = await loadRoute(code, {
      fresh: true,
      files: { 'groupings.ts': "export const groupings = [['component']]\n" },
    })
    expectDiagnostic(await served(route), {
      severity: 'error',
      file: 'route.tsx',
      root: route.host.root,
      position: diagnosticPosition(code, 'groupings,'),
    })
  })

  it('are read through a const naming another', async () => {
    const route = await loadRoute(
      `${head}const groupings = [['loader'], ['component']] as const
const chosen = groupings as any
export const Route = createFileRoute('/')({
  codeSplitGroupings: chosen,
  loader: () => 'data',
  component: () => <p>page</p>,
})
`,
      { fresh: true },
    )
    expect(await route.isLazy('loader')).toBe(true)
    expectNoProblems(await route.diagnostics())
  })
})

describe('codeSplitGroupings the compiler does not read', () => {
  it('an accessor: the route works with the default groupings (Astra R12)', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  get codeSplitGroupings() {
    return [['loader', 'component']]
  },
  loader: () => 42,
  component: () => <p>page</p>,
})
`,
      { fresh: true },
    )
    expect(await route.run(`return options.loader()`)).toBe(42)
    expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
    expectNoProblems(await route.diagnostics())
  })

  it('a computed value with splitting off, compiled for route HMR (Astra R8)', async () => {
    const route = await loadRoute(
      `${head}const define = () => [['loader'], ['component']]
export const Route = createFileRoute('/')({
  codeSplitGroupings: define(),
  loader: () => 42,
  component: () => <p>page</p>,
})
`,
      { fresh: true, hmr: true, pluginOptions: { autoCodeSplitting: false } },
    )
    expect(await route.run(`return options.loader()`)).toBe(42)
    expectNoProblems(await route.diagnostics())
  })
})

describe('codeSplitGroupings of a root route, which is never split', () => {
  it.each([
    [
      'an imported value',
      `import { createRootRoute } from '@tanstack/react-router'
import { groupings } from './groupings'
export const Route = createRootRoute({
  codeSplitGroupings: groupings,
  component: () => <p>root</p>,
})
`,
    ],
    [
      'an option listed twice',
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  codeSplitGroupings: [['component'], ['component']] as any,
  component: () => <p>root</p>,
})
`,
    ],
  ])('leave the route working, as on main: %s', async (_, code) => {
    const route = await loadRoute(code, {
      fresh: true,
      files: { 'groupings.ts': "export const groupings = [['component']]\n" },
    })
    expect(await route.run(`return render('component')`)).toBe('<p>root</p>')
    expectNoProblems(await route.diagnostics())
  })
})

describe('plugin options with invalid groupings', () => {
  it.for([
    [{ defaultBehavior: [['compnent']] }],
    [{ defaultBehavior: [['component'], ['component']] }],
  ])('fail the dev server with one error: %j', async ([options]) => {
    const thrown = await captureThrow(async () => {
      const route = await loadRoute(
        `${head}export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})
`,
        {
          fresh: true,
          pluginOptions: { codeSplittingOptions: options as never },
        },
      )
      await route.transform()
    })
    expect(thrown.map((d) => d.severity)).toEqual(['error'])
  })
})
