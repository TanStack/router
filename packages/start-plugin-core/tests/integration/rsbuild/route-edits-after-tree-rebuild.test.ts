/**
 * Route edits around route-tree rebuilds on Start's Rsbuild dev server
 * (`../route-edits-after-tree-rebuild.ts`): a loader edit after a route was
 * added or renamed shows on the route's page (SPEC J5.2, G10). Its own file
 * so that each bundler's dev servers run in a worker of their own.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { pluginReact } from '@rsbuild/plugin-react'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import {
  editLoaderAroundTreeRebuilds,
  treeRebuildApp,
} from '../route-edits-after-tree-rebuild'

const timeout = 90_000

describe('Rsbuild dev: route edits after a route tree rebuild', () => {
  test(
    'a loader edit shows after a route was added, and after a route was renamed',
    async () => {
      const server = await startRsbuildStartDevServer({
        hmr: true,
        browser: true,
        // Start serves the pages, not an HTML template.
        config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] },
        files: treeRebuildApp,
      })
      expect(reportedErrors(server)).toEqual([])
      await editLoaderAroundTreeRebuilds(
        {
          url: server.url,
          edit: (files) => server.edit(files),
          rename: (from, to) => server.rename(from, to),
          settled: () => server.settle(),
        },
        onTestFinished,
      )
      expect(reportedErrors(server)).toEqual([])
    },
    timeout,
  )
})
