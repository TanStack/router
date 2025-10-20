/* eslint-disable @typescript-eslint/consistent-type-imports */

export const VIRTUAL_MODULES = {
  startManifest: 'tanstack-start-manifest:v',
  serverFnManifest: '#tanstack-start-server-fn-manifest',
  injectedHeadScripts: 'tanstack-start-injected-head-scripts:v',
} as const

export type VirtualModules = {
  [VIRTUAL_MODULES.startManifest]: typeof import('tanstack-start-manifest:v')
  [VIRTUAL_MODULES.injectedHeadScripts]: typeof import('tanstack-start-injected-head-scripts:v')
}
