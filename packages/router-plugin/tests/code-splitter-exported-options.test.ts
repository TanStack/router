/**
 * A split option whose value is a binding the route file exports stays in
 * the route module (main's rule), and the warning points at what to edit:
 * the export declaration of the first name it lists, which can be far from
 * the route call (1,843 lines apart in a corpus app), and names every such
 * option's binding. Routes load on a real dev server (`./route-app`).
 * Source: diagnostics spike (2026-11-24), inventory flag 4, agreed change
 * A3 (Kontor2's `AntragForm`).
 */
import { describe, expect, it } from 'vitest'
import {
  diagnosticPosition,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { head, loadRoute } from './route-app'

const page = `() {
  return <p>page</p>
}`

describe('an exported binding as a split option', () => {
  it.for([
    {
      name: 'an exported function',
      decls: `export function Page${page}`,
      at: 'export function Page',
    },
    {
      name: 'a default-exported function',
      decls: `export default function Page${page}`,
      at: 'export default function Page',
    },
    {
      name: 'a function exported as default by name',
      decls: `function Page${page}\nexport default Page`,
      at: 'export default Page',
    },
    {
      name: 'an exported const',
      decls: `export const Page = () => <p>page</p>`,
      at: 'export const Page',
    },
  ])('$name: reported at its export, naming it', async ({ decls, at }) => {
    const code = `${head}${decls}
export const Route = createFileRoute('/')({ component: Page })
`
    const route = await loadRoute(code, { fresh: true })
    expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
    const reports = findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
      position: diagnosticPosition(code, at),
    })
    expect(reports).toHaveLength(1)
    expect(reports[0]!.text).toContain(
      '`Page` stays in the route module because',
    )
    expect(reports[0]!.text).toContain('remove its export')
  })

  // Source: Astra's review of the implementation (6: "`C` and `C` stay").
  it('one exported binding two options name: listed once', async () => {
    const code = `${head}export function Page${page}
export const Route = createFileRoute('/')({
  component: Page,
  notFoundComponent: Page,
})
`
    const route = await loadRoute(code, { fresh: true })
    expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
    const reports = findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    })
    expect(reports).toHaveLength(1)
    expect(reports[0]!.text).toContain(
      '`Page` stays in the route module because',
    )
  })

  it('two exported bindings: one report, at the first listed export, naming both', async () => {
    const code = `${head}export function Crash${page}
export function Page${page}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: Crash,
})
`
    const route = await loadRoute(code, { fresh: true })
    expect(await route.run(`return render('component')`)).toBe('<p>page</p>')
    const reports = findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: 'route.tsx',
      root: route.host.root,
    })
    expect(reports).toHaveLength(1)
    expect(reports[0]!.text).toContain('`Page` and `Crash` stay')
    expect(
      findDiagnostics(reports, {
        position: diagnosticPosition(code, 'export function Page'),
      }),
    ).toHaveLength(1)
  })
})
