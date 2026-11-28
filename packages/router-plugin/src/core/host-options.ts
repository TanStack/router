import type { Config } from './config'

/**
 * Lets a plugin that embeds the route generator, such as TanStack Start,
 * change when it runs. The function is called late, once the bundler's
 * config is known, with the generator's config. Every option defaults to
 * the standalone behaviour.
 */
export type RouterGeneratorHostOptions = (config: Config) => {
  /** `false` creates no generator at all for this config. */
  enabled?: boolean
  /** `false` ignores file changes after the first run. */
  watch?: boolean
  /** `false` keeps the generator from writing route files. */
  writeRouteFiles?: boolean
}

/**
 * Lets a plugin that embeds the code splitter, such as TanStack Start, change
 * what it handles. The function is called for each module.
 */
export interface RouterCodeSplitterHostOptions {
  /**
   * Return `true` to also handle a module that calls a route factory but is
   * unknown to the route generator. Nothing is split out of such a module;
   * only the route options listed in `deleteNodes` are removed from it.
   */
  deleteNodesInUnknownRoutes?: () => boolean
}
