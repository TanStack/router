import path from 'node:path'
import * as fsp from 'node:fs/promises'
import {
  determineInitialRoutePath,
  logging,
  removeExt,
  removeLeadingSlash,
  removeTrailingSlash,
  replaceBackslash,
  routePathToVariable,
} from '../../utils'
import { getRouteNodes as getRouteNodesVirtual } from '../virtual/getRouteNodes'
import { loadConfigFile } from '../virtual/loadConfigFile'
import { rootPathId } from './rootPathId'
import type {
  VirtualRootRoute,
  VirtualRouteSubtreeConfig,
} from '@tanstack/virtual-file-routes'
import type { FsRouteType, GetRouteNodesResult, RouteNode } from '../../types'
import type { Config } from '../../config'

const disallowedRouteGroupConfiguration = /\(([^)]+)\).(ts|js|tsx|jsx)/

export async function getRouteNodes(
  config: Config,
  root: string,
): Promise<GetRouteNodesResult> {
  const { routeFilePrefix, routeFileIgnorePrefix, routeFileIgnorePattern } =
    config
  const logger = logging({ disabled: config.disableLogging })
  const routeFileIgnoreRegExp = new RegExp(routeFileIgnorePattern ?? '', 'g')

  const routeNodes: Array<RouteNode> = []

  async function recurse(dir: string) {
    const fullDir = path.resolve(config.routesDirectory, dir)
    let dirList = await fsp.readdir(fullDir, { withFileTypes: true })

    dirList = dirList.filter((d) => {
      if (
        d.name.startsWith('.') ||
        (routeFileIgnorePrefix && d.name.startsWith(routeFileIgnorePrefix))
      ) {
        return false
      }

      if (routeFilePrefix) {
        return d.name.startsWith(routeFilePrefix)
      }

      if (routeFileIgnorePattern) {
        return !d.name.match(routeFileIgnoreRegExp)
      }

      return true
    })

    const virtualConfigFile = dirList.find((dirent) => {
      return dirent.isFile() && dirent.name.match(/__virtual\.[mc]?[jt]s$/)
    })

    if (virtualConfigFile !== undefined) {
      const virtualRouteConfigExport = await loadConfigFile(
        path.resolve(fullDir, virtualConfigFile.name),
      )
      let virtualRouteSubtreeConfig: VirtualRouteSubtreeConfig
      if (typeof virtualRouteConfigExport.default === 'function') {
        virtualRouteSubtreeConfig = await virtualRouteConfigExport.default()
      } else {
        virtualRouteSubtreeConfig = virtualRouteConfigExport.default
      }
      const dummyRoot: VirtualRootRoute = {
        type: 'root',
        file: '',
        children: virtualRouteSubtreeConfig,
      }
      const { routeNodes: virtualRouteNodes } = await getRouteNodesVirtual(
        {
          ...config,
          routesDirectory: fullDir,
          virtualRouteConfig: dummyRoot,
        },
        root,
      )
      virtualRouteNodes.forEach((node) => {
        const filePath = replaceBackslash(path.join(dir, node.filePath))
        const routePath = `/${dir}${node.routePath}`

        node.variableName = routePathToVariable(
          `${dir}/${removeExt(node.filePath)}`,
        )
        node.routePath = routePath
        node.filePath = filePath
      })

      routeNodes.push(...virtualRouteNodes)

      return
    }

    await Promise.all(
      dirList.map(async (dirent) => {
        const fullPath = path.posix.join(fullDir, dirent.name)
        const relativePath = path.posix.join(dir, dirent.name)

        if (dirent.isDirectory()) {
          await recurse(relativePath)
        } else if (fullPath.match(/\.(tsx|ts|jsx|js)$/)) {
          const filePath = replaceBackslash(path.join(dir, dirent.name))
          const filePathNoExt = removeExt(filePath)
          let routePath = determineInitialRoutePath(filePathNoExt)

          if (routeFilePrefix) {
            routePath = routePath.replaceAll(routeFilePrefix, '')
          }

          if (disallowedRouteGroupConfiguration.test(dirent.name)) {
            const errorMessage = `A route configuration for a route group was found at \`${filePath}\`. This is not supported. Did you mean to use a layout/pathless route instead?`
            logger.error(`ERROR: ${errorMessage}`)
            throw new Error(errorMessage)
          }

          const meta = getRouteMeta(routePath, config)
          const variableName = meta.variableName
          let routeType: FsRouteType = meta.fsRouteType

          if (routeType === 'lazy') {
            routePath = routePath.replace(/\/lazy$/, '')
          }

          // this check needs to happen after the lazy route has been cleaned up
          // since the routePath is used to determine if a route is pathless
          if (isValidPathlessLayoutRoute(routePath, routeType, config)) {
            routeType = 'pathless_layout'
          }

          ;(
            [
              ['component', 'component'],
              ['errorComponent', 'errorComponent'],
              ['pendingComponent', 'pendingComponent'],
              ['loader', 'loader'],
            ] satisfies Array<[FsRouteType, string]>
          ).forEach(([matcher, type]) => {
            if (routeType === matcher) {
              logger.warn(
                `WARNING: The \`.${type}.tsx\` suffix used for the ${filePath} file is deprecated. Use the new \`.lazy.tsx\` suffix instead.`,
              )
            }
          })

          routePath = routePath.replace(
            new RegExp(
              `/(component|errorComponent|pendingComponent|loader|${config.routeToken}|lazy)$`,
            ),
            '',
          )

          if (routePath === config.indexToken) {
            routePath = '/'
          }

          routePath =
            routePath.replace(new RegExp(`/${config.indexToken}$`), '/') || '/'

          routeNodes.push({
            filePath,
            fullPath,
            routePath,
            variableName,
            _fsRouteType: routeType,
          })
        }
      }),
    )

    return routeNodes
  }

  await recurse('./')

  const rootRouteNode = routeNodes.find((d) => d.routePath === `/${rootPathId}`)
  if (rootRouteNode) {
    rootRouteNode._fsRouteType = '__root'
  }

  return { rootRouteNode, routeNodes }
}

/**
 * Determines the metadata for a given route path based on the provided configuration.
 *
 * @param routePath - The determined initial routePath.
 * @param config - The user configuration object.
 * @returns An object containing the type of the route and the variable name derived from the route path.
 */
export function getRouteMeta(
  routePath: string,
  config: Config,
): {
  // `__root` is can be more easily determined by filtering down to routePath === /${rootPathId}
  // `pathless` is needs to determined after `lazy` has been cleaned up from the routePath
  fsRouteType: Extract<
    FsRouteType,
    | 'static'
    | 'layout'
    | 'api'
    | 'lazy'
    | 'loader'
    | 'component'
    | 'pendingComponent'
    | 'errorComponent'
  >
  variableName: string
} {
  let fsRouteType: FsRouteType = 'static'

  if (
    removeLeadingSlash(routePath).startsWith(
      `${removeTrailingSlash(removeLeadingSlash(config.apiBase))}/`,
    ) &&
    config.__enableAPIRoutesGeneration
  ) {
    // api routes, i.e. `/api/foo.ts`
    fsRouteType = 'api'
  } else if (routePath.endsWith(`/${config.routeToken}`)) {
    // layout routes, i.e `/foo/route.tsx` or `/foo/_layout/route.tsx`
    fsRouteType = 'layout'
  } else if (routePath.endsWith('/lazy')) {
    // lazy routes, i.e. `/foo.lazy.tsx`
    fsRouteType = 'lazy'
  } else if (routePath.endsWith('/loader')) {
    // loader routes, i.e. `/foo.loader.tsx`
    fsRouteType = 'loader'
  } else if (routePath.endsWith('/component')) {
    // component routes, i.e. `/foo.component.tsx`
    fsRouteType = 'component'
  } else if (routePath.endsWith('/pendingComponent')) {
    // pending component routes, i.e. `/foo.pendingComponent.tsx`
    fsRouteType = 'pendingComponent'
  } else if (routePath.endsWith('/errorComponent')) {
    // error component routes, i.e. `/foo.errorComponent.tsx`
    fsRouteType = 'errorComponent'
  }

  const variableName = routePathToVariable(routePath)

  return { fsRouteType, variableName }
}

/**
 * Used to validate if a route is a pathless layout route
 * @param normalizedRoutePath Normalized route path, i.e `/foo/_layout/route.tsx` and `/foo._layout.route.tsx` to `/foo/_layout/route`
 * @param config The `router-generator` configuration object
 * @returns Boolean indicating if the route is a pathless layout route
 */
function isValidPathlessLayoutRoute(
  normalizedRoutePath: string,
  routeType: FsRouteType,
  config: Config,
): boolean {
  if (routeType === 'lazy') {
    return false
  }

  const segments = normalizedRoutePath.split('/').filter(Boolean)

  if (segments.length === 0) {
    return false
  }

  const lastRouteSegment = segments[segments.length - 1]!
  const secondToLastRouteSegment = segments[segments.length - 2]

  // If segment === __root, then exit as false
  if (lastRouteSegment === rootPathId) {
    return false
  }

  // If segment === config.routeToken and secondToLastSegment is a string that starts with _, then exit as true
  // Since the route is actually a configuration route for a layout/pathless route
  // i.e. /foo/_layout/route.tsx === /foo/_layout.tsx
  if (
    lastRouteSegment === config.routeToken &&
    typeof secondToLastRouteSegment === 'string'
  ) {
    return secondToLastRouteSegment.startsWith('_')
  }

  // Segment starts with _
  return (
    lastRouteSegment !== config.indexToken &&
    lastRouteSegment !== config.routeToken &&
    lastRouteSegment.startsWith('_')
  )
}
