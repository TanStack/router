import { digestOf } from '@tanstack/router-utils/compiler'
import { defaultCodeSplitGroupings } from '../core/constants'
import type { CodeSplitGroupings } from '../core/constants'
import type { CodeSplittingOptions } from '../core/config'

export type HmrStyle = 'vite' | 'webpack'

/** The router planner's name: its `perPlanner` key and its prefetch slot. */
export const ROUTER_PLANNER = 'router'

/** The router planner's configuration of one environment (`routerPlannerConfigFrom`). */
export interface RouterPlannerConfig {
  framework: 'react' | 'solid' | 'vue'
  /** Whether route options are split; `deleteNodes` applies regardless. */
  split: boolean
  defaultGroupings: CodeSplitGroupings
  splitBehavior?:
    | ((params: { routeId: string }) => CodeSplitGroupings | undefined | void)
    | undefined
  deleteNodes: ReadonlyArray<string>
  /** Route HMR with the bundler's hot API: a development client environment only; null elsewhere. */
  hmr: { style: HmrStyle } | null
}

export interface RouterPlannerEnv {
  framework: RouterPlannerConfig['framework']
  envType: 'client' | 'server'
  mode: 'dev' | 'build'
  /** The bundler's hot API: Vite's, or webpack's (Rspack too). */
  hmrStyle: HmrStyle
  /**
   * Start's rules instead of the router plugin's. The router plugin splits
   * when `autoCodeSplitting` is on and applies `addHmr` and `deleteNodes` as
   * given. Start splits in every environment: the server must render the
   * tree the client hydrates (Solid's hydration keys follow the lazy
   * wrapper's components, and React wraps a match in Suspense when its
   * error component is lazy). Its client always has route HMR and erases
   * the server-only options whatever `deleteNodes` says; its server
   * environments erase `deleteNodes`.
   */
  start: boolean
  /** The router plugin's `autoCodeSplitting`. */
  autoCodeSplitting?: boolean
}

/** The route options Start erases from client route modules. */
const START_CLIENT_DELETE_NODES: ReadonlyArray<string> = [
  'ssr',
  'server',
  'headers',
]

/** The router planner's configuration of an environment, from the user's `codeSplittingOptions`. */
export function routerPlannerConfigFrom(
  options: CodeSplittingOptions | undefined,
  env: RouterPlannerEnv,
): RouterPlannerConfig {
  const client = env.envType === 'client'
  const hmr =
    env.mode === 'dev' && client && (env.start || (options?.addHmr ?? true))
  return {
    framework: env.framework,
    split: env.start || env.autoCodeSplitting === true,
    defaultGroupings: options?.defaultBehavior ?? defaultCodeSplitGroupings,
    splitBehavior: options?.splitBehavior,
    deleteNodes:
      env.start && client
        ? START_CLIENT_DELETE_NODES
        : (options?.deleteNodes ?? []),
    hmr: hmr ? { style: env.hmrStyle } : null,
  }
}

/** The configuration's part of a compile's `configKey`. */
export function routerPlannerConfigDigest(cfg: RouterPlannerConfig): string {
  return digestOf({
    framework: cfg.framework,
    split: cfg.split,
    groupings: cfg.defaultGroupings,
    splitBehavior: cfg.splitBehavior?.toString() ?? null,
    deleteNodes: cfg.deleteNodes,
    hmr: cfg.hmr,
  })
}

/** Whether the router planner can change a route module of this configuration (else a host may skip the parse). */
export function routerPlannerApplies(cfg: RouterPlannerConfig): boolean {
  return cfg.split || cfg.deleteNodes.length > 0 || cfg.hmr !== null
}

/**
 * Whether React route HMR is on: components React Refresh may keep in place
 * then carry the route-HMR identity marker (`$$tsrRefreshId`, compared by the
 * runtime when a re-imported chunk arrives). The router planner marks the
 * components of its split chunks, Start's Hydrate planner those of its
 * boundary chunks.
 */
export function routeRefreshMarkers(cfg: RouterPlannerConfig | null): boolean {
  return cfg?.hmr != null && cfg.framework === 'react'
}
