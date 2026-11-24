import { installPackage } from '../../package-layouts'
import { rsbuildEntries } from '../route-css-cases'

/** `src/role.ts`: a middleware factory whose parameter only server code reads, a compiler warning. */
export const roleFile = `import { createMiddleware } from '@tanstack/react-start'
export const requireRole = (role: string) =>
  createMiddleware().server(async ({ next }) => {
    if (role === 'none') {
      throw new Error('no')
    }
    return next()
  })
`

/** `ui-kit`, a package that uses Start and does not declare it: a package warning. */
export const uiKit = installPackage('npm', {
  name: 'ui-kit',
  files: {
    'a.js': `import { createIsomorphicFn } from '@tanstack/react-start'
export const tag = createIsomorphicFn().client(() => 'client').server(() => 'server')
`,
  },
})
/** The file the package's warning names. */
export const uiKitFile = `${uiKit.directory}/a.js`

const root = `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`
const plainPage = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>PAGE</p> })
`
const packagePage = `import { createFileRoute } from '@tanstack/react-router'
import { tag } from 'ui-kit/a.js'
export const Route = createFileRoute('/')({ component: () => <p>{tag()}</p> })
`
/** A worker that imports the package and the middleware factory. */
export const workerFile = `import { tag } from 'ui-kit/a.js'
import { requireRole } from './role'
self.onmessage = () => self.postMessage([tag(), String(requireRole)])
`

/**
 * A Start app with a worker (`src/worker.ts`, built by the app's worker
 * plugin) that imports `ui-kit` and `src/role.ts`. `page`: the page imports
 * the package too (the client's and the server's compilations hold it).
 * `server`: the server entry does (the server's only).
 */
export function workerApp(holders: { page?: boolean; server?: boolean } = {}) {
  return {
    ...rsbuildEntries,
    ...uiKit.files,
    'src/routes/__root.tsx': root,
    'src/routes/index.tsx': holders.page ? packagePage : plainPage,
    'src/role.ts': roleFile,
    'src/worker.ts': workerFile,
    ...(holders.server && {
      'src/server-uses.ts': `import { tag } from 'ui-kit/a.js'\nconsole.log(tag)\n`,
      'src/server.ts': `import './server-uses'\n${rsbuildEntries['src/server.ts']}`,
    }),
  }
}
