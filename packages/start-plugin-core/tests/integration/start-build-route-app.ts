import { loadMarker } from '@tanstack/compiler-test-utils/importers'

/**
 * A route whose loader and component each read a module of their own
 * that records when it loads (`loadMarker`): what loads, and when, is
 * observed at run time, not through chunk names.
 */
export const routeFiles = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/loader-data.ts': `${loadMarker('loader')}export const loaderData = 'MARK_LOADER'\n`,
  'src/component-label.ts': `${loadMarker('component')}export const componentLabel = 'MARK_COMPONENT'\n`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { loaderData } from '../loader-data'
import { componentLabel } from '../component-label'
export const Route = createFileRoute('/')({
loader: () => loaderData,
component: () => componentLabel,
})
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
`,
}
