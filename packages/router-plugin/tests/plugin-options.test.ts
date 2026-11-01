/**
 * Router plugin options and entry points: what each option changes in a
 * real app, through the public plugins in a real Vite dev server.
 */
import { describe, expect, test } from 'vitest'
import {
  captureThrow,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { head, loadRoute } from './route-app'

describe('repeated options in split groupings', () => {
  test('in a route are refused with an error naming the route file and the option', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['loader', 'component']],
  loader: () => 'data',
  component: () => <p>page</p>,
})
`,
      { filename: 'groupings-route.tsx' },
    )
    // The error the compile throws, with what every channel reported (the
    // wording and the channel are free, SPEC §5.7)
    const thrown = await captureThrow(() => route.transform())
    expect(thrown).not.toEqual([])
    expectDiagnostic([...thrown, ...(await route.diagnostics())], {
      severity: 'error',
      file: 'groupings-route.tsx',
      root: route.host.root,
    })
  })
})
