/**
 * Vue single-file components on Rsbuild (vue-loader: `@rsbuild/plugin-vue`'s
 * rspack-vue-loader, or vue-loader with its `VueLoaderPlugin`).
 *
 * vue-loader turns `x.vue` into a glue module that imports each block as its
 * own module. With its inline match resource (`experimentalInlineMatchResource`,
 * `@rsbuild/plugin-vue`'s default), the script block's request is
 * `x.vue.js?vue&type=script…!=!-!<loaders>!x.vue?vue&type=script…`: rules match
 * `x.vue.js` (or `.ts`, the block's `lang`), so the late rule of other module
 * types (`.vue`) never sees it, and Start's `pre` loader runs before
 * vue-loader, on the SFC's text. The script block's rule below reads the
 * block's JavaScript after vue-loader and the language loaders. Without the
 * inline match resource the block is `x.vue?vue&type=script…`, which the late
 * rule matches.
 */
import type { Rspack } from '@rsbuild/core'

/** The match resource vue-loader gives a block: `x.vue.<lang>` (a script block's `lang` is JS or TS). */
const VUE_SCRIPT_BLOCK_RE = /\.vue\.[cm]?[jt]sx?$/
/** A script block's query (`?vue&type=script&setup=true&lang=js`). */
const SCRIPT_BLOCK_QUERY_RE = /[?&]type=script(?:&|$)/

/** Whether the configuration builds Vue SFCs with vue-loader (its plugin is required). */
export function buildsVueSfcs(config: Rspack.Configuration): boolean {
  return (config.plugins ?? []).some(
    (plugin) =>
      !!plugin &&
      typeof plugin === 'object' &&
      plugin.constructor.name === 'VueLoaderPlugin',
  )
}

/**
 * The `post` rule of the late pass over a script block requested under
 * vue-loader's inline match resource.
 */
export function vueScriptBlockRule(
  use: Rspack.RuleSetUseItem,
): Rspack.RuleSetRule {
  return {
    test: VUE_SCRIPT_BLOCK_RE,
    resourceQuery: SCRIPT_BLOCK_QUERY_RE,
    enforce: 'post',
    use: [use],
  }
}

/** What `runsAgainLater` reads of a loader context. */
export interface LoaderChainLike {
  loaders: ReadonlyArray<{ path: string; options?: unknown }>
  loaderIndex: number
}

/**
 * Whether a late loader of Start's runs again later on the same module.
 * vue-loader's pitcher copies the loaders of a block request (the late
 * loader of the `.vue` rule, and of this module's script block rule) into
 * the request it generates, and Rspack applies the configured `post` rules
 * to that request again: the last one in the chain compiles (a pass over its
 * own output would wrap each server fn again).
 */
export function runsAgainLater(ctx: LoaderChainLike): boolean {
  const self = ctx.loaders[ctx.loaderIndex]
  // loaders before this one in the chain run after it
  for (let i = 0; i < ctx.loaderIndex; i++) {
    const loader = ctx.loaders[i]!
    if (
      loader.path === self?.path &&
      (loader.options as { pass?: unknown } | undefined)?.pass === 'late'
    ) {
      return true
    }
  }
  return false
}
