import { afterEach, expect, test } from 'vitest'
import { Workspace, errorsIn } from './workspace'

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

test('generated mounts reject incompatible context and required host search', async () => {
  const ws = (workspace = new Workspace())
  const modules = [
    'products',
    'storefront',
    'account',
    'team',
    'settings',
    'billing',
  ]
  await ws.buildGraph([...modules, 'web'], modules)
  const originalAuthentication = ws.read('web', 'src/routes/_authenticated.tsx')
  ws.edit('web', 'src/routes/_authenticated.tsx', (source) => {
    expect(source).toContain("user: { id: 'u-1' }")
    return source.replace("user: { id: 'u-1' }", "user: 'invalid-context'")
  })
  const incompatible = await ws.check('web')
  expect(incompatible.ok).toBe(false)
  expect(
    errorsIn(incompatible.diagnostics, 'src/routeTree.gen.ts').join('\n'),
  ).toMatch(/compatible types/)

  ws.write('web', 'src/routes/_authenticated.tsx', originalAuthentication)
  const originalOrganization = ws.read('web', 'src/routes/orgs.$orgId.tsx')
  ws.edit('web', 'src/routes/orgs.$orgId.tsx', (source) => {
    expect(source).toContain('  beforeLoad:')
    return source.replace(
      '  beforeLoad:',
      '  validateSearch: (search: { region: string }) => search,\n  beforeLoad:',
    )
  })
  const requiredSearch = await ws.check('web')
  expect(requiredSearch.ok).toBe(false)
  expect(
    errorsIn(requiredSearch.diagnostics, 'src/routeTree.gen.ts').join('\n'),
  ).toMatch(/requires search params/)

  ws.write('web', 'src/routes/orgs.$orgId.tsx', originalOrganization)
  const valid = await ws.check('web')
  expect(valid.diagnostics).toEqual([])
  expect(valid.ok).toBe(true)
})
