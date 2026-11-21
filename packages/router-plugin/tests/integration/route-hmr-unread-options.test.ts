/**
 * Route options the compiler cannot read, shared across evaluations of the
 * route file (SPEC J2.8, J3.3): the route adopts the object it is given, so a
 * second evaluation would find it already holding the route's id and path. An
 * edit of the file reloads the page (the dev full-reload allowance) and leaves
 * no error, each time.
 */
import { describe, expect, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'

const timeout = 60_000

const route = (top: string, options: string, edit: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
${top}
// ${edit}
export const Route = createFileRoute('/')(${options})
`

describe.each(['vite', 'rsbuild'] as const)('%s dev', (bundler) => {
  test.each([
    {
      name: 'imported',
      options: 'options',
      top: `import { options } from './-options'`,
    },
    {
      name: 'from a call returning one object',
      options: 'make()',
      top: `import { make } from './-options'`,
    },
  ])(
    'options $name: every edit of the route file leaves the page working',
    async ({ top, options }) => {
      const app = await openRouteHmrPage({
        bundler,
        files: {
          'routes/-options.tsx': `export const options = { component: () => <p>shared page</p> }
export const make = () => options
`,
          'routes/index.tsx': route(top, options, 'v1'),
        },
        ready: 'shared page',
      })
      for (const edit of ['v2', 'v3']) {
        const result = await app.edit(
          { 'routes/index.tsx': route(top, options, edit) },
          'shared page',
        )
        expect(result.errors).toEqual([])
      }
    },
    timeout,
  )
})
