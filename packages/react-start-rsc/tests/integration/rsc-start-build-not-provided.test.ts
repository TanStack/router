/**
 * A production build of a React Start app with RSC enabled on Vite
 * (`rsc-app.ts`) whose client calls server fns the provider's resolver does
 * not list (SPEC J4.2; the known bugs below): the provider builds before
 * the client, so these calls would answer "Server function info not
 * found". The build fails, naming each such function and its file, with the
 * way out for a file of the app and for one of an installed package. Those
 * ways out run in rsc-start-build-client-reach.test.ts ("the build error's
 * way out …"), whose build also shows that a server fn only development
 * code imports is named by no error.
 */
import { describe, expect, test } from 'vitest'
import {
  clientOnlyPositions,
  clientOnlyReachFiles,
  installedServerFnFiles,
} from './client-only-reach-app'
import { failedRscBuild } from './rsc-app'

const files = {
  ...clientOnlyReachFiles,
  // A `'use client'` component that imports a server fn's module lazily.
  'src/guarded/lazy.ts': `import { createServerFn } from '@tanstack/react-start'
export const lazyPing = createServerFn({ method: 'GET' }).handler(() => 'MARK_LAZY')
`,
  'src/guarded/LazyPing.tsx': `'use client'
import { useState } from 'react'
export function LazyPing() {
  const [result, setResult] = useState('')
  return (
    <button data-testid="lazy" onClick={() => import('./lazy').then((m) => m.lazyPing()).then(setResult)}>
      lazy {result}
    </button>
  )
}
`,
  'src/guarded/card.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { LazyPing } from './LazyPing'
export const getCard = createServerFn().handler(() => renderServerComponent(<div>card <LazyPing /></div>))
`,
  'src/routes/guarded.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getCard } from '../guarded/card'
export const Route = createFileRoute('/guarded')({
  loader: async () => ({ tree: await getCard() }),
  component: Page,
})
function Page() {
  return <main>{Route.useLoaderData().tree}</main>
}
`,
  // A `'use client'` component calling an installed package's server fn,
  // which a server fn's handler also uses (the way out for a file of the
  // app, which does not apply to it). The package does not declare Start:
  // the reach walk enters only packages that do.
  ...installedServerFnFiles,
  'node_modules/pkg-fns/package.json': JSON.stringify({
    name: 'pkg-fns',
    version: '1.0.0',
    type: 'module',
    exports: { '.': './index.js' },
  }),
  'src/pkg/PkgCall.tsx': `'use client'
import { useState } from 'react'
import { pkgPing } from 'pkg-fns'
export function PkgCall() {
  const [result, setResult] = useState('')
  return <button data-testid="pkg" onClick={() => pkgPing().then(setResult)}>pkg {result}</button>
}
`,
  'src/pkg/uses.ts': `import { createServerFn } from '@tanstack/react-start'
import { pkgPing } from 'pkg-fns'
export const usesPkg = createServerFn().handler(async () => 'USES ' + (await pkgPing()))
`,
  'src/pkg/page.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { PkgCall } from './PkgCall'
export const getPkgPage = createServerFn().handler(() => renderServerComponent(<div>pkg <PkgCall /></div>))
`,
  'src/routes/pkg.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getPkgPage } from '../pkg/page'
import { usesPkg } from '../pkg/uses'
export const Route = createFileRoute('/pkg')({
  loader: async () => ({ tree: await getPkgPage(), uses: await usesPkg() }),
  component: Page,
})
function Page() {
  return <main>{Route.useLoaderData().tree}</main>
}
`,
}

/** The line of the build error naming `name` of `file`. */
const named = (name: string, file: string) => `  - ${name} of ${file}`

const wayOut = {
  app: "For a file of the app: import the server function in a server function's module as well, and use it in that function's handler.",
  installed:
    'For a file of an installed package: the package must declare TanStack Start (@tanstack/react-start in its peerDependencies), so that Start bundles its modules for the server and reads them.',
}

describe('Vite production build with RSC: server fns the client calls that the RSC build does not provide', () => {
  let error: string

  test.beforeAll(async () => {
    ;({ error } = await failedRscBuild({
      files,
      config: { build: { minify: false } },
    }))
  })

  // Known bug (KNOWN-BUGS, "Vite RSC build: a server fn only client-only
  // code imports is not registered"; as `main`). SPEC J4.2: a server fn the
  // client calls is callable by id. Bug: the SSR scan erases client-only
  // code (`<ClientOnly>` children, `createClientOnlyFn` bodies, `<Hydrate>`
  // fallbacks) and the imports only it reads, and the early compile of the
  // provider's reach starts only from server fn modules, which none of these
  // route or component files is, so the provider's manifest is written
  // without these server fns. Impact: the build fails (the click would
  // answer "Server function info not found"). Fix: every server fn the
  // client references is callable by id, with no production dependency on
  // modules only development code reaches.
  test.for(clientOnlyPositions)(
    'a server fn only $position of a $where imports fails the build, naming it',
    ({ name }) => {
      expect(error.split('\n')).toContain(
        named(name, `src/client-only/${name}.ts`),
      )
    },
  )

  // Known bug (KNOWN-BUGS, "Vite RSC build: a server fn a `'use client'`
  // component imports lazily is not registered"; as `main`, #7943). SPEC
  // J4.2. Bug: the early compile follows no lazy import at or below a
  // `'use client'` module (so a development-only one adds no production
  // dependency), and nothing else compiles the lazily imported module in the
  // provider before its manifest is written. Impact: the build fails. Fix:
  // as above.
  test("a server fn a 'use client' component imports lazily fails the build, naming it", () => {
    expect(error.split('\n')).toContain(
      named('lazyPing', 'src/guarded/lazy.ts'),
    )
  })

  // Known bug (KNOWN-BUGS, "Vite RSC build: a server fn a `'use client'`
  // component imports from an installed package that does not declare
  // Start … is not registered"; as `main`, #7943). SPEC J4.2. Bug: the early
  // compile of the provider's reach skips the modules of a package that
  // does not declare Start, also below a server fn's handler that uses the
  // function. Impact: the build fails. Fix: as above.
  test("an installed package's server fn a 'use client' component and a server fn's handler import fails the build, naming it", () => {
    expect(error.split('\n')).toContain(
      named('pkgPing', 'node_modules/pkg-fns/index.js'),
    )
  })

  // The error names no other server fn, states what is proven (the
  // resolver's list against the client's calls) and gives the way out for
  // each kind of file it names.
  test('the build error names only those server fns, with the way out for a file of the app and one of an installed package', () => {
    const lines = error.split('\n')
    expect({
      named: lines.filter((line) => line.startsWith('  - ')).sort(),
      proven: lines.some((line) =>
        line.includes(
          `The client build calls server functions that the RSC environment's server function resolver does not list: each call would answer "Server function info not found".`,
        ),
      ),
      wayOut: lines.filter(
        (line) => line === wayOut.app || line === wayOut.installed,
      ),
    }).toEqual({
      named: [
        ...clientOnlyPositions.map(({ name }) =>
          named(name, `src/client-only/${name}.ts`),
        ),
        named('lazyPing', 'src/guarded/lazy.ts'),
        named('pkgPing', 'node_modules/pkg-fns/index.js'),
      ].sort(),
      proven: true,
      wayOut: [wayOut.app, wayOut.installed],
    })
  })
})
