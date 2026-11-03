import { afterEach, expect, test } from 'vitest'
import { Workspace, errorsIn } from './workspace'

let workspace: Workspace | undefined

afterEach(() => {
  workspace?.dispose()
  workspace = undefined
})

test('generated mounts reject a parsed host key overwritten by module descendants', async () => {
  const ws = (workspace = new Workspace())
  ws.write(
    'settings',
    'src/routes/members.$memberId.tsx',
    `import { createFileRoute } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/settings:/members/$memberId')({
  loader: ({ params }) => ({ member: params.memberId }),
})
`,
  )
  ws.edit('web', 'src/routes/orgs.$orgId.tsx', (source) => {
    expect(source).toContain('  beforeLoad:')
    return source.replace(
      '  beforeLoad:',
      `  params: {
    parse: ({ orgId }) => ({ orgId, memberId: 'host-member' }),
    stringify: ({ orgId }) => ({ orgId }),
  },
  beforeLoad:`,
    )
  })
  const modules = [
    'products',
    'storefront',
    'account',
    'team',
    'settings',
    'billing',
  ]
  await ws.buildGraph([...modules, 'web'], modules)
  const collision = await ws.check('web')
  expect(collision.ok).toBe(false)
  expect(
    errorsIn(collision.diagnostics, 'src/routeTree.gen.ts').join('\n'),
  ).toMatch(/memberId/)

  // A distinct parsed host key is valid. Type changes need only the normal
  // consumer recheck; the route topology and generated mount are unchanged.
  ws.edit('web', 'src/routes/orgs.$orgId.tsx', (source) =>
    source.replace(
      "memberId: 'host-member'",
      "organizationMemberId: 'host-member'",
    ),
  )
  for (const file of ['src/routes/__root.tsx', 'src/routes/index.tsx']) {
    ws.edit('web', file, (source) =>
      source.replaceAll(
        /(params=\{\{ orgId: '[^']+') \}\}/g,
        "$1, organizationMemberId: 'host-member' }}",
      ),
    )
  }
  ws.edit('web', 'src/profile-links.tsx', (source) =>
    source.replace(
      "params: { orgId: 'acme' }",
      "params: { orgId: 'acme', organizationMemberId: 'host-member' }",
    ),
  )
  const valid = await ws.check('web')
  expect(valid.diagnostics).toEqual([])
  expect(valid.ok).toBe(true)
})
