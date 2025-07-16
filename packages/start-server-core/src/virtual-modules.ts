/* eslint-disable @typescript-eslint/consistent-type-imports */

export const VIRTUAL_MODULES = {
  routeTree: 'tanstack-start-route-tree:v',
  startManifest: 'tanstack-start-manifest:v',
  serverFnManifest: 'tanstack-start-server-fn-manifest:v',
} as const

export type VirtualModules = {
  [VIRTUAL_MODULES.routeTree]: typeof import('tanstack-start-route-tree:v')
  [VIRTUAL_MODULES.startManifest]: typeof import('tanstack-start-manifest:v')
  [VIRTUAL_MODULES.serverFnManifest]: typeof import('tanstack-start-server-fn-manifest:v')
}
