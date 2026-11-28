/**
 * A program that runs the compiler of an Rsbuild instance itself
 * (`createCompiler()`, then its `run()`, possibly several times): Rsbuild
 * dispatches none of its build hooks (`onBeforeBuild`,
 * `onAfterEnvironmentCompile`, `onAfterBuild`). Each run builds what a
 * fresh production build of the same files builds, and serves.
 * Source: Astra, re-check 5 of #8817 (a build through the compiler served
 * 500 `Cannot read properties of undefined (reading '__root__')`; a second
 * run, after the edit removing the only import `allowImport` allowed, failed
 * with a conflict naming that import; main builds and serves both).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildRscLinks } from '../../start-plugins'
import { rsbuildEntries } from '../route-css-cases'
import type { StartBuildOptions } from '../../build-harness'

const root = `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`

/** The page at `/` renders what the server reads from `feature.ts`. */
const files = {
  ...rsbuildEntries,
  'src/routes/__root.tsx': root,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { read } from '../feature'
const label = createIsomorphicFn()
  .server(() => String(read()))
  .client(() => 'MARK_CLIENT')
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main>{label()}</main>
}
`,
  'src/private.client.ts': `export function denied() {
  return 'MARK_REAL'
}
`,
  // the one import of the denied file, which `allowImport` allows
  'src/feature.ts': `import { denied } from './private.client'
export function read() {
  return denied()
}
`,
}

/** `feature.ts` reads the denied file through a context instead (an importer import protection does not check). */
const featureThroughContext = `const files = import.meta.webpackContext('./', {
  recursive: false,
  regExp: /^\\.\\/private\\.client\\.ts$/,
})
export function read() {
  return 'CONTEXT ' + String(files('./private.client.ts').denied())
}
`

/** The text of the page's `<main>` and the response's status. */
async function page(url: string): Promise<{ status: number; main?: string }> {
  const response = await fetch(url)
  const html = await response.text()
  return {
    status: response.status,
    main: /<main[^>]*>(.*?)<\/main>/s.exec(html)?.[1],
  }
}

/** `@tanstack/react-start`'s RSC option (not one of every framework's Start config). */
const rscEnabled = { rsc: { enabled: true } }

test('a build through the compiler serves its pages', async () => {
  const built = await buildStart({
    bundler: 'rsbuild',
    rsbuildCompiler: true,
    files,
    start: { importProtection: { enabled: false } },
  })
  const { url } = await built.preview()
  expect(await page(url)).toEqual({ status: 200, main: 'MARK_REAL' })
})

describe.each([
  { name: 'without RSC', rsc: false },
  { name: 'with RSC', rsc: true },
])('$name', ({ rsc }) => {
  /** The app with `appFiles`: `allowImport` allows `feature.ts`'s import of the denied file. */
  const appOptions = (appFiles = files): StartBuildOptions => ({
    bundler: 'rsbuild',
    files: appFiles,
    ...(rsc && { symlinks: rsbuildRscLinks() }),
    start: {
      ...(rsc && rscEnabled),
      importProtection: {
        behavior: 'mock',
        allowImport: (info) =>
          info.importer.endsWith('/feature.ts') &&
          info.specifier === './private.client',
      },
    },
  })

  test('a second run of the compiler, after the edit removing the one allowed import, builds as a fresh build of the edited files', async () => {
    const first = await buildStart({
      ...appOptions(),
      rsbuildCompiler: true,
      samePlugins: true,
    })
    // the allowed import brings the real module (the server is served once:
    // the preview imports the server entry of the app's directory once)
    expect(first.ssr.where('MARK_REAL')).not.toBe('nowhere')
    const second = await first.rebuild({
      'src/feature.ts': featureThroughContext,
    })
    const fresh = await buildStart(
      appOptions({ ...files, 'src/feature.ts': featureThroughContext }),
    )
    const expected = await page((await fresh.preview()).url)
    expect(expected).toEqual({
      status: 200,
      main: 'CONTEXT [import-protection mock]',
    })
    expect(await page((await second.preview()).url)).toEqual(expected)
  })
})

// what a run's compiles read of another module (an import's binding, here a
// re-exported Start API) is that module as the run reads it
test('a second run of the compiler compiles an import of a module edited since as a fresh build does', async () => {
  const appFiles = {
    ...rsbuildEntries,
    'src/routes/__root.tsx': root,
    'src/only.ts': `export const only = <T,>(fn: T) => fn\n`,
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { only } from '../only'
const secret = only(() => 'MARK_SECRET')
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main>{String(secret)}</main>
}
`,
  }
  const first = await buildStart({
    bundler: 'rsbuild',
    rsbuildCompiler: true,
    samePlugins: true,
    files: appFiles,
  })
  expect(first.client.where('MARK_SECRET')).not.toBe('nowhere')
  const second = await first.rebuild({
    'src/only.ts': `export { createServerOnlyFn as only } from '@tanstack/react-start'\n`,
  })
  expect(second.client.where('MARK_SECRET')).toBe('nowhere')
  expect(second.ssr.where('MARK_SECRET')).not.toBe('nowhere')
})

test('a second run of the compiler generates the routes added since', async () => {
  let generations = 0
  const first = await buildStart({
    bundler: 'rsbuild',
    rsbuildCompiler: true,
    samePlugins: true,
    files: {
      ...rsbuildEntries,
      'src/routes/__root.tsx': root,
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => <main>MARK_INDEX</main>,
})
`,
    },
    start: {
      router: {
        plugins: [
          {
            name: 'test:generations',
            onRouteTreeChanged: () => {
              generations++
            },
          },
        ],
      },
    },
  })
  expect(generations).toBe(1)
  generations = 0
  const second = await first.rebuild({
    'src/routes/about.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({
  component: () => <main>MARK_ABOUT</main>,
})
`,
  })
  expect(generations).toBe(1)
  const tree = await readFile(
    path.join(second.root, 'src/routeTree.gen.ts'),
    'utf8',
  )
  expect(tree).toContain(`path: '/about'`)
})
