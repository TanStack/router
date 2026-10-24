import * as t from '@babel/types'
import { getObjectPropertyKeyName } from '@tanstack/router-plugin'
import type { CodeSplitCompilerPlugin } from '@tanstack/router-plugin'
import type { TanStackStartOutputConfig } from '../schema'

type CodeSplittingOptions = NonNullable<
  TanStackStartOutputConfig['router']['codeSplittingOptions']
>
type InternalCodeSplittingOptions = CodeSplittingOptions & {
  compilerPlugins?: Array<CodeSplitCompilerPlugin>
}
type CodeSplittingOptionsWithCompilerPlugins = CodeSplittingOptions & {
  compilerPlugins: Array<CodeSplitCompilerPlugin>
}

const noSsrOptions = new Set(['component', 'loader', 'beforeLoad'])
const dataOnlySsrOptions = new Set(['component'])

export function createSsrRouteOptionPruningPlugin(): CodeSplitCompilerPlugin {
  return {
    name: 'tanstack-start:ssr-route-option-pruning',
    onRouteOptions({ routeOptions, opts }) {
      const serverSsr = opts.serverSsr
      const removedOptions =
        serverSsr === false
          ? noSsrOptions
          : serverSsr === 'data-only'
            ? dataOnlySsrOptions
            : undefined

      if (!removedOptions) {
        return
      }

      const previousLength = routeOptions.properties.length
      routeOptions.properties = routeOptions.properties.filter((property) => {
        if (
          property.type !== 'ObjectProperty' &&
          property.type !== 'ObjectMethod'
        ) {
          return true
        }

        const key = getObjectPropertyKeyName(property)
        return !key || !removedOptions.has(key)
      })

      if (serverSsr === false) {
        // Hydration uses the server match's pending status to run client loaders.
        // Keep the load signal after removing their implementations. This hook
        // never executes on the server because SSR is disabled for this route.
        routeOptions.properties.push(
          t.objectProperty(
            t.identifier('beforeLoad'),
            t.arrowFunctionExpression([], t.blockStatement([])),
          ),
        )
      }

      return {
        modified:
          serverSsr === false ||
          routeOptions.properties.length !== previousLength,
      }
    },
  }
}

export function withSsrRouteOptionPruning(
  options: CodeSplittingOptions | undefined,
  overrides: Pick<CodeSplittingOptions, 'addHmr' | 'deleteNodes'>,
): CodeSplittingOptionsWithCompilerPlugins {
  const internalOptions: InternalCodeSplittingOptions | undefined = options
  return {
    ...options,
    ...overrides,
    compilerPlugins: [
      createSsrRouteOptionPruningPlugin(),
      ...(internalOptions?.compilerPlugins ?? []),
    ],
  }
}
