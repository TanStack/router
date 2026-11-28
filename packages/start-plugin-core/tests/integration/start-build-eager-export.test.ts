/**
 * The router's pure APIs are no effect: tamery's `const { useSearch } =
 * getRouteApi(…)` before the route loads with the chunk and is not
 * reported.
 */
import { describe, expect, test } from 'vitest'
import { expectNoDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { startBundlers } from '../build-harness'
import { buildStart } from '../build-start'

const route = `import { createFileRoute } from '@tanstack/react-router'
export function Card() {
  return <b>MARK_CARD</b>
}
function Page() {
  return <Card />
}
export const Route = createFileRoute('/card')({ component: Page })
`

const classRoute = `import { createFileRoute } from '@tanstack/react-router'
export class Tag {
  static label = 'MARK_TAG'
}
function Page() {
  return <b>{new Tag() instanceof Tag ? Tag.label : 'other'}</b>
}
export const Route = createFileRoute('/tag')({ component: Page })
`

/** The app's own router module (the client entry loads it), importing `Card` and `Tag` through their route files or not. */
const router = (importsCard: boolean) =>
  `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
${importsCard ? "import { Card } from './routes/card'\nimport { Tag } from './routes/tag'\n;(globalThis as any).Card = Card\n;(globalThis as any).Tag = Tag\n" : ''}export const getRouter = () => createRouter({ routeTree })
`

const files = {
  'src/routes/card.tsx': route,
  'src/routes/tag.tsx': classRoute,
  'src/router.tsx': router(false),
  'entry.ts': 'export const ok = true\n',
}

// (no order rule: a `validateSearch` call after the declaration pins
// nothing, and two split options reading it share a lazy module, R151; a
// statement changing it that uses what the route module keeps keeps it,
// `written`)
const pinned = `import { createFileRoute } from '@tanstack/react-router'
import { Marker } from '../marker'
const settings = { tab: 'string' }
const confetti = new Marker('MARK_CONFETTI')
confetti.attach(settings)
export const Route = createFileRoute('/account')({
  validateSearch: () => settings,
  component: () => <p>{confetti.name}</p>,
})
`

const pinnedFiles = {
  ...files,
  'src/routes/account.tsx': pinned,
  'src/marker.ts': `export class Marker {
  constructor(public name: string) {
    ;((globalThis as any).marks ??= []).push(name)
  }
  attach(settings: object) {
    ;(this as any).settings = settings
  }
}
`,
  'src/schema.ts': 'export function makeSchema<T>(shape: T) { return shape }\n',
}

/** tamery's account route: the route's API between the pinned effect and the route. */
const withRouteApi = (path: string, imports: string, api: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
import { Marker } from '../marker'
import { makeSchema } from '../schema'
${imports}
const confetti = new Marker('MARK_CONFETTI_${path}')
const { useSearch } = ${api}
export const Route = createFileRoute('/${path}')({
  validateSearch: makeSchema({ tab: 'string' }),
  component: () => <p>{confetti.name}{String(useSearch)}</p>,
})
`

const routeApiFiles = {
  ...pinnedFiles,
  'src/routes/direct.tsx': withRouteApi(
    'direct',
    "import { getRouteApi } from '@tanstack/react-router'",
    "getRouteApi('MARK_API_direct')",
  ),
  // a framework's pure call (React `memo`): the component it creates loads
  // with the chunk, although the `validateSearch` call after it stays
  'src/routes/memo.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { memo } from 'react'
import { makeSchema } from '../schema'
const Page = memo(function Inner() {
  return <p>{'MARK_MEMO'}</p>
})
export const Route = createFileRoute('/memo')({
  validateSearch: makeSchema({ tab: 'string' }),
  component: Page,
})
`,
}

describe.each(startBundlers)(
  'a %s build of routes reading their API',
  (bundler) => {
    test('loads the API, the effect before it and a memo component with the chunk, unreported', async () => {
      const build = await buildStart({ bundler, files: routeApiFiles })
      const reported = [...build.client.warnings, ...build.ssr.warnings]
      // (no order rule: the effect before the API moves with it)
      for (const path of ['direct']) {
        expect(build.client.where(`MARK_API_${path}`), path).toBe('lazy')
        expect(build.client.where(`MARK_CONFETTI_${path}`), path).toBe('lazy')
        expectNoDiagnostic(reported, {
          file: `src/routes/${path}.tsx`,
          root: build.root,
        })
      }
      expect(build.client.where('MARK_MEMO')).toBe('lazy')
      expectNoDiagnostic(reported, {
        file: 'src/routes/memo.tsx',
        root: build.root,
      })
    })
  },
)
