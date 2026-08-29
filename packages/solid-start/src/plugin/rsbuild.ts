import {
  RSBUILD_ENVIRONMENT_NAMES,
  tanStackStartRsbuild,
} from '@tanstack/start-plugin-core/rsbuild'
import { solidStartDefaultEntryPaths } from './shared'
import type {
  TanStackStartRsbuildInputConfig,
  TanStackStartRsbuildPluginCoreOptions,
} from '@tanstack/start-plugin-core/rsbuild'
import type { RsbuildPlugin } from '@rsbuild/core'

export function tanstackStart(
  options?: TanStackStartRsbuildInputConfig,
): RsbuildPlugin {
  const corePluginOpts: TanStackStartRsbuildPluginCoreOptions = {
    framework: 'solid',
    defaultEntryPaths: solidStartDefaultEntryPaths,
    providerEnvironmentName: RSBUILD_ENVIRONMENT_NAMES.server,
    ssrIsProvider: true,
    rsbuild: {
      environments: {
        all: {
          resolve: {
            conditionNames: ['solid', '...'],
          },
        },
      },
    },
  }

  const basePlugin = tanStackStartRsbuild(corePluginOpts, options)

  return {
    name: 'tanstack-solid-start-rsbuild',
    setup(api) {
      basePlugin.setup(api)

      api.modifyBundlerChain(async (chain, { CHAIN_ID, target }) => {
        for (const ruleId of [
          CHAIN_ID.RULE.JS,
          CHAIN_ID.RULE.JS_DATA_URI,
          'babel-js',
        ]) {
          if (!chain.module.rules.has(ruleId)) {
            continue
          }

          const rule = chain.module.rule(ruleId)
          if (!rule.uses.has(CHAIN_ID.USE.BABEL)) {
            continue
          }

          rule.use(CHAIN_ID.USE.BABEL).tap((babelOptions) => {
            babelOptions.presets = (babelOptions.presets ?? []).map(
              (preset: unknown) => {
                if (
                  Array.isArray(preset) &&
                  typeof preset[0] === 'string' &&
                  preset[0].includes('babel-preset-solid')
                ) {
                  return [
                    preset[0],
                    {
                      ...(preset[1] ?? {}),
                      hydratable: true,
                      generate: target === 'node' ? 'ssr' : 'dom',
                    },
                  ]
                }

                return preset
              },
            )

            return babelOptions
          })
        }

        // @rsbuild/plugin-solid >= 2.0.0-beta.1 compiles through its own
        // `solid` loader (native compiler by default) instead of registering
        // babel-preset-solid, so the preset patch above never fires for it.
        if (chain.module.rules.has(CHAIN_ID.RULE.JS)) {
          const jsRule = chain.module.rule(CHAIN_ID.RULE.JS)
          if (jsRule.oneOfs.has(CHAIN_ID.ONE_OF.JS_MAIN)) {
            const jsMainRule = jsRule.oneOf(CHAIN_ID.ONE_OF.JS_MAIN)
            if (jsMainRule.uses.has('solid')) {
              jsMainRule.use('solid').tap((loaderOptions) => ({
                ...loaderOptions,
                solid: {
                  ...(loaderOptions?.solid ?? {}),
                  hydratable: true,
                  generate: target === 'node' ? 'ssr' : 'dom',
                },
              }))
            }
          }
        }
      })
    },
  }
}
