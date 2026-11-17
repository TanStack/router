/**
 * Split groupings the compiler cannot honour fail the route module with an
 * error positioned at what the route file wrote (R101): an option that
 * cannot be split, one listed twice, an imported value. Plugin options
 * with invalid groupings fail the dev server with one error. Groupings in a
 * local `const` are read.
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
