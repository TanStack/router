import type { AnyRouter } from './router'

/**
 * Phantom type container for a router plugin.
 *
 * @private
 */
export interface RouterPluginTypes<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  context: TContext
}

/**
 * Interface that router plugins must satisfy.
 * Defined in router-core so the router can accept plugins
 * without depending on specific plugin implementations.
 *
 * The `TContext` phantom type carries the shape of the context values
 * that this plugin provides, enabling the router to compute which
 * context keys the user must supply manually.
 *
 * @private
 */
export interface RouterPlugin<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Phantom type container carrying the provided context type.
   * @private
   */
  '~types': RouterPluginTypes<TContext>
  /**
   * Called by the router constructor to wire up the plugin.
   * @private
   */
  setup: (router: AnyRouter) => void
}

/**
 * Merge the context types from a tuple of router plugins into
 * a single intersection.  Returns `{}` for an empty tuple.
 *
 * @private
 */
export type PluginProvidedContext<TPlugins> = TPlugins extends readonly [
  RouterPlugin<infer TContext>,
  ...infer TRest,
]
  ? TContext & PluginProvidedContext<TRest>
  : {}
