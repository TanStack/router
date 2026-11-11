/**
 * One verdict on "is this file a route" (design 5, I1): the route
 * generator's registry says whether a route file's `Route` is the router
 * package's constructor call of the file's kind (`routerConstructor`), and
 * the code splitter splits that route, and only that one. Each row is a
 * spelling of a route file: the registry's verdict for it (a real
 * `Generator` over an app of its own) is whether the page's route has a lazy
 * component (a real dev server with the router plugin, `./route-app`).
 * Shapes: /home/flo/11-10-fable52-review/DESIGN-5-evidence/recognisers.mjs.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { Generator, getConfig } from '@tanstack/router-generator'
import { runDirectory } from '@tanstack/compiler-test-utils/run-directory'
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
  /** The verdict both sides agree on. */
  route: boolean
  files?: Record<string, string>
  /** The file holds a root constructor: registered as a route anyway. */
  root?: false
  /** The route renders in the app (another framework's route does not). */
  renders?: false
  /** Pinned: the sides disagree today. */
  pinned?: boolean
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
    // Bug: the generator does not unwrap the cast (design 5 D1)
    name: 'a namespace import in a cast',
    code: `import * as R from '${RP}'\nexport const Route = (R as any).createFileRoute('/x')(${options})\n`,
    route: true,
    pinned: true,
  },
  {
    name: 'a constructor in a cast',
    code: `import { createFileRoute } from '${RP}'\nexport const Route = (createFileRoute as any)('/x')(${options})\n`,
    route: true,
  },
  {
    // Bug: the planner takes any framework's router package (design 5 D3)
    name: "another framework's router package",
    code: `import { createFileRoute } from '@tanstack/solid-router'\nexport const Route = createFileRoute('/x')(${options})\n`,
    route: false,
    renders: false,
    pinned: true,
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
    pinned: true,
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

/** `routerConstructor` of `src/routes/x.tsx` holding `code`, as a real generator lists it. */
async function registryVerdict(row: Row) {
  const root = await mkdtemp(path.join(runDirectory(), 'tsr-recognition-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const files: Record<string, string> = {
    'src/routes/__root.tsx': `import { createRootRoute } from '${RP}'\nexport const Route = createRootRoute()\n`,
    'src/routes/x.tsx': row.code,
    ...Object.fromEntries(
      Object.entries(row.files ?? {}).map(([file, code]) => [
        `src/routes/${file}`,
        code,
      ]),
    ),
  }
  for (const [file, code] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), code)
  }
  const config = getConfig(
    {
      target: 'react',
      disableLogging: true,
      tmpDir: path.join(root, '.tanstack/tmp'),
    },
    root,
  )
  const generator = new Generator({ config, root })
  await generator.run({ type: 'build' })
  return [...generator.getRoutesByFileMap().values()].find(
    (v) => v.routeId === '/x',
  )?.routerConstructor
}

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

const check = async (row: Row) => {
  const listed = await registryVerdict(row)
  const split = await splitVerdict(row)
  expect({ listed, split }).toEqual({ listed: row.route, split: row.route })
}

describe('the generator and the code splitter agree on what a route is', () => {
  it.for(rows.filter((row) => !row.pinned))('$name', check)
  it.for(rows.filter((row) => row.pinned))('$name', { fails: true }, check)
})
