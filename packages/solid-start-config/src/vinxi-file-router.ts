import {
  BaseFileSystemRouter as VinxiBaseFileSystemRouter,
  analyzeModule as vinxiFsRouterAnalyzeModule,
  cleanPath as vinxiFsRouterCleanPath,
} from 'vinxi/fs-router'
import {
  CONSTANTS as GENERATOR_CONSTANTS,
  startAPIRouteSegmentsFromTSRFilePath,
} from '@tanstack/router-generator'
import type { configSchema } from '@tanstack/router-generator'
import type {
  AppOptions as VinxiAppOptions,
  RouterSchemaInput as VinxiRouterSchemaInput,
} from 'vinxi'
import type { z } from 'zod'

export function tanstackStartVinxiFileRouter(opts: {
  tsrConfig: z.infer<typeof configSchema>
  apiBase: string
}) {
  const apiBaseSegment = opts.apiBase.split('/').filter(Boolean).join('/')
  const isAPIPath = new RegExp(`/${apiBaseSegment}/`)

  return function (router: VinxiRouterSchemaInput, app: VinxiAppOptions) {
    // Our own custom File Router that extends the VinxiBaseFileSystemRouter
    // for splitting the API routes into its own "bundle"
    // and adding the $APIRoute metadata to the route object
    // This could be customized in future to support more complex splits
    class TanStackStartFsRouter extends VinxiBaseFileSystemRouter {
      toPath(src: string): string {
        const inputPath = vinxiFsRouterCleanPath(src, this.config)

        const segments = startAPIRouteSegmentsFromTSRFilePath(
          inputPath,
          opts.tsrConfig,
        )

        const pathname = segments
          .map((part) => {
            if (part.type === 'splat') {
              return `*splat`
            }

            if (part.type === 'param') {
              return `:${part.value}?`
            }

            return part.value
          })
          .join('/')

        return pathname.length > 0 ? `/${pathname}` : '/'
      }

      toRoute(src: string) {
        const webPath = this.toPath(src)

        const [_, exports] = vinxiFsRouterAnalyzeModule(src)

        const hasAPIRoute = exports.find(
          (exp) => exp.n === GENERATOR_CONSTANTS.APIRouteExportVariable,
        )

        return {
          path: webPath,
          filePath: src,
          $APIRoute:
            isAPIPath.test(webPath) && hasAPIRoute
              ? {
                  src,
                  pick: [GENERATOR_CONSTANTS.APIRouteExportVariable],
                }
              : undefined,
        }
      }
    }

    return new TanStackStartFsRouter(
      {
        dir: opts.tsrConfig.routesDirectory,
        extensions: ['js', 'jsx', 'ts', 'tsx'],
      },
      router,
      app,
    )
  }
}
