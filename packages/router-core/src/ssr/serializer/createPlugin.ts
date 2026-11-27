import type { Plugin, PluginInfo } from 'seroval'

/**
 * Identity helper equivalent to seroval's `createPlugin`. Defined locally so
 * client-side modules that only need typed plugin objects do not carry an
 * import edge to the seroval runtime, which lets bundlers keep seroval out of
 * the initial chunk for apps that never serialize on the client.
 */
/* @__NO_SIDE_EFFECTS__ */
export function createPlugin<TValue, TNode extends PluginInfo>(
  plugin: Plugin<TValue, TNode>,
): Plugin<TValue, TNode> {
  return plugin
}
