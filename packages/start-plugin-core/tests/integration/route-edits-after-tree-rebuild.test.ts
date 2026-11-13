/**
 * Route edits around route-tree rebuilds on Start's Vite dev server
 * (`./route-edits-after-tree-rebuild.ts`): a loader edit after a route was
 * added or renamed shows on the route's page (SPEC J5.2, G10). The Rsbuild
 * counterpart: rsbuild/route-edits-after-tree-rebuild.test.ts.
 */
import react from '@vitejs/plugin-react'
import { describe, onTestFinished, test } from 'vitest'
import { settlePage } from '@tanstack/compiler-test-utils/hmr-sync'
import { startDevServer } from '../dev-server'
import {
  editLoaderAroundTreeRebuilds,
  treeRebuildApp,
} from './route-edits-after-tree-rebuild'

const timeout = 90_000

/** Pre-bundled up front, as Vite does for an app that installed them. */
const reactOptimizeDeps = {
  include: [
    'react',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@tanstack/react-router',
    '@tanstack/react-router > @tanstack/router-core > seroval',
    '@tanstack/react-router > @tanstack/router-core > seroval-plugins/web',
  ],
}

describe('Vite dev: route edits after a route tree rebuild', () => {
  test(
    'a loader edit shows after a route was added, and after a route was renamed',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        config: { optimizeDeps: reactOptimizeDeps },
        plugins: [react()],
        files: treeRebuildApp,
      })
      await editLoaderAroundTreeRebuilds(
        {
          url: server.url,
          edit: (files) => server.edit(files),
          rename: (from, to) => server.rename(from, to),
          settled: () => server.idle(),
          // Vite reloads the pages of a changed route tree
          settlePage: (page, inFlight) => settlePage(server, page, inFlight),
        },
        onTestFinished,
      )
    },
    timeout,
  )
})
