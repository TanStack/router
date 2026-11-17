/**
 * What the code splitter splits: the route a route file creates with its
 * router package's constructor (`createFileRoute`, however imported and
 * exported), and only that one. Each row is a spelling of a route file,
 * loaded on a real dev server with the router plugin (`./route-app`): the
 * route renders, and its component is lazy exactly when it is such a route.
 */
import { describe, expect, it } from 'vitest'
import { expectValidModules, loadRoute } from './route-app'

const RP = '@tanstack/react-router'
const options = `{ component: () => 'MARK_PAGE' }`
const lib = {
  '-lib.ts': `import { createFileRoute as routerFileRoute } from '${RP}'
export const createAppRoute = (id: any) => (options: any) => routerFileRoute(id)(options)
export { createFileRoute } from '${RP}'
`,
}

interface Row {
  name: string
  code: string
  /** Whether the file's `Route` is the router package's route, split. */
  route: boolean
  files?: Record<string, string>
  /** The file holds a root constructor (the generator repairs it). */
  root?: false
  /** The route renders in the app (another framework's route does not). */
  renders?: false
}

const rows: Array<Row> = [
  {
    name: 'a named import',
    code: `import { createFileRoute } from '${RP}'\nexport const Route = createFileRoute('/x')(${options})\n`,
    route: true,
  },
  {
    name: 'an aliased import',
    code: `import { createFileRoute as cfr } from '${RP}'\nexport const Route = cfr('/x')(${options})\n`,
    route: true,
  },
  {
    name: 'a namespace import',
    code: `import * as R from '${RP}'\nexport const Route = R.createFileRoute('/x')(${options})\n`,
    route: true,
  },
  {
    name: 'a namespace import in a cast',
    code: `import * as R from '${RP}'\nexport const Route = (R as any).createFileRoute('/x')(${options})\n`,
    route: true,
  },
  {
    name: 'a constructor in a cast',
    code: `import { createFileRoute } from '${RP}'\nexport const Route = (createFileRoute as any)('/x')(${options})\n`,
    route: true,
  },
  {
    name: "another framework's router package",
    code: `import { createFileRoute } from '@tanstack/solid-router'\nexport const Route = createFileRoute('/x')(${options})\n`,
    route: false,
    renders: false,
  },
  {
    name: 'an export list',
    code: `import { createFileRoute } from '${RP}'\nconst Route = createFileRoute('/x')(${options})\nexport { Route }\n`,
    route: true,
  },
  {
    name: 'a renamed export',
    code: `import { createFileRoute } from '${RP}'\nconst R = createFileRoute('/x')(${options})\nexport { R as Route }\n`,
    route: true,
  },
  {
    name: 'a let',
    code: `import { createFileRoute } from '${RP}'\nexport let Route = createFileRoute('/x')(${options})\n`,
    route: true,
  },
  {
    name: 'a root constructor in a route file',
    code: `import { createRootRoute } from '${RP}'\nexport const Route = createRootRoute(${options})\n`,
    // (R144: the generator repairs it to createFileRoute('/x'))
    route: true,
    root: false,
  },
  {
    name: "an app's own route helper",
    code: `import { createAppRoute } from './-lib'\nexport const Route = createAppRoute('/x')(${options})\n`,
    route: false,
    files: lib,
  },
  {
    name: "an app module's re-export of the constructor",
    code: `import { createFileRoute } from './-lib'\nexport const Route = createFileRoute('/x')(${options})\n`,
    route: false,
    files: lib,
  },
  {
    name: 'a wrapped route call',
    code: `import { createFileRoute } from '${RP}'\nconst wrap = <T,>(r: T) => r\nexport const Route = wrap(createFileRoute('/x')(${options}))\n`,
    route: false,
  },
  {
    name: 'a constructor call stored in a const',
    code: `import { createFileRoute } from '${RP}'\nconst make = createFileRoute('/x')\nexport const Route = make(${options})\n`,
    route: false,
  },
  {
    name: 'a route stored in another const',
    code: `import { createFileRoute } from '${RP}'\nconst R = createFileRoute('/x')(${options})\nexport const Route = R\n`,
    route: false,
  },
]

/** Whether the page's route has a lazy component (the code splitter split it). */
async function splitVerdict(row: Row) {
  const route = await loadRoute(row.code, {
    routeId: '/x',
    files: row.files,
    ...(row.root === false && { root: false, fresh: true }),
  })
  await expectValidModules(route)
  if (row.renders !== false) {
    expect(await route.run('return renderRoute()')).toContain('MARK_PAGE')
  }
  return route.isLazy('component')
}

describe('the code splitter splits the route of a route file', () => {
  it.for(rows)('$name', async (row) => {
    expect(await splitVerdict(row)).toBe(row.route)
  })
})
