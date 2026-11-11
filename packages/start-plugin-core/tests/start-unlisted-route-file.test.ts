/**
 * R145: under Start, a file the route generator does not list that exports a
 * router-made `Route` (here a widget module a route imports, outside the
 * routes directory) is served as written, as on main and with the router
 * plugin alone: not code-split, its `server` option kept, nothing reported.
 * The generator decides what a route is; the compilers read its registry.
 */
import { expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { useStartHost } from './regression-helpers'

const host = useStartHost({
  files: {
    'src/widgets/w.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/w')({
  component: () => 'MARK_W_PAGE',
  server: { handlers: { GET: () => new Response('MARK_W_SERVER') } },
})
`,
    'src/routes/widget.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Route as Widget } from '../widgets/w'
export const Route = createFileRoute('/widget')({
  component: () => String(Widget.options.component),
})
`,
  },
})

// Bug: the router planner recognises the route call by itself and splits
// the file and removes its `server` option (design 5 D5).
test.fails(
  'a route file the generator does not list is served as written, with nothing reported',
  async () => {
    const { host: dev, diagnostics, root } = await host()
    const served = await dev.transform('/src/widgets/w.tsx', 'client')

    // the component stays in the module, `server` stays too
    expect(served).toContain('MARK_W_PAGE')
    expect(served).toContain('MARK_W_SERVER')
    expect(
      findDiagnostics(diagnostics, {
        severity: ['warning', 'error'],
        file: 'src/widgets/w.tsx',
        root,
      }),
    ).toEqual([])
  },
)
