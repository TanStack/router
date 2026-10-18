/**
 * Route file edits in a real Vite dev server with the router plugin and the
 * app's framework plugin (`@vitejs/plugin-react`, `vite-plugin-solid`,
 * `@vitejs/plugin-vue-jsx`): which HMR messages the page receives. Vite
 * decides from the served code which modules accept their own updates (HMR
 * boundaries); an update no boundary accepts reloads the page.
 */
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import { routerDevServer, routerPackageStub } from './dev-server'
import type { HmrMessage } from '@tanstack/compiler-test-utils/dev-server'
import type { PluginOption, Update } from 'vite'
import type { TargetFramework } from './regression-helpers'

export type RouteEdit = {
  target: TargetFramework
  autoCodeSplitting: boolean
  /** The framework's Vite plugins, after the router plugin. */
  plugins?: Array<PluginOption>
  /** The route file, relative to the app root. Default `routes/index.tsx`. */
  file?: string
  /** The route file of each version (`'page'` first, then `'edited'`). */
  route: (version: string) => string
  /**
   * Modules the page loaded besides the client entry and what it imports
   * statically, e.g. a split component (`?tsr-split=component`, relative to
   * the route file's URL), as the page rendering the route did.
   */
  loaded?: Array<string>
  /** Other files of the app, relative to its root. */
  files?: Record<string, string>
}

/** Dependencies, Vite's client and the router package stub (`/@id/...`). */
const notLoaded = /^\/@id\/|\/node_modules\/|^\/@(?:vite|react-refresh)\b/

/**
 * Starts a dev server (router package stubbed) on an app whose client entry
 * imports the route tree, loads the entry, what it imports and `loaded` in
 * the client environment, as a page does, edits the route file and returns
 * what the client received: the HMR messages (`describeHmr` lines), the
 * updates (each boundary `path` and the module it imports again,
 * `acceptedPath`), and whether the edit is a hot update without a reload.
 */
export async function editRouteFile(edit: RouteEdit) {
  const file = edit.file ?? 'routes/index.tsx'
  const server = await routerDevServer({
    pluginOptions: {
      target: edit.target,
      autoCodeSplitting: edit.autoCodeSplitting,
    },
    plugins: [routerPackageStub(edit.target), ...(edit.plugins ?? [])],
    files: {
      ...edit.files,
      [file]: edit.route('page'),
      'entry.ts': `export { routeTree } from './routeTree.gen'`,
    },
  })
  await server.load('/entry.ts', { skip: notLoaded })
  for (const url of edit.loaded ?? []) {
    await server.load(`/${file}${url}`, { skip: notLoaded })
  }
  const messages = (await server.edit({ [file]: edit.route('edited') })).filter(
    (message) => message.environment === 'client',
  )
  const updates = messages.flatMap((message: HmrMessage) =>
    message.payload.type === 'update'
      ? message.payload.updates.map(({ path, acceptedPath }: Update) => ({
          path,
          acceptedPath,
        }))
      : [],
  )
  const described = describeHmr(messages)
  return {
    messages: described,
    updates,
    /** The page applies the edit in place: an update and no full reload. */
    hotUpdate:
      updates.length > 0 &&
      !described.some((message) => message.startsWith('client: full-reload')),
    /** Whether the client imports this module (URL) again. */
    reimports: (url: string) =>
      updates.some((update) => update.acceptedPath === url),
  }
}
