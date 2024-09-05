import path from 'node:path'
import * as fsp from 'node:fs/promises'
import {
  determineInitialRoutePath,
  logging,
  removeExt,
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
import type { GetRouteNodesResult, RouteNode } from '../../types'
import type { Config } from '../../config'

const disallowedRouteGroupConfiguration = /\(([^)]+)\).(ts|js|tsx|jsx)/

export async function getRouteNodes(
  config: Config,
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
      const { routeNodes: virtualRouteNodes } = await getRouteNodesVirtual({
        ...config,
        routesDirectory: fullDir,
        virtualRouteConfig: dummyRoot,
      })
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
        const fullPath = path.join(fullDir, dirent.name)
        const relativePath = path.join(dir, dirent.name)

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

          const variableName = routePathToVariable(routePath)

          const isLazy = routePath.endsWith('/lazy')

          if (isLazy) {
            routePath = routePath.replace(/\/lazy$/, '')
          }

          const isRoute = routePath.endsWith(`/${config.routeToken}`)
          const isComponent = routePath.endsWith('/component')
          const isErrorComponent = routePath.endsWith('/errorComponent')
          const isPendingComponent = routePath.endsWith('/pendingComponent')
          const isLoader = routePath.endsWith('/loader')
          const isAPIRoute = routePath.startsWith(
            `${removeTrailingSlash(config.apiBase)}/`,
          )

          const segments = routePath.split('/')
          const lastRouteSegment = segments[segments.length - 1]
          const isLayout =
            (lastRouteSegment !== config.indexToken &&
              lastRouteSegment !== config.routeToken &&
              lastRouteSegment?.startsWith('_')) ||
            false

          ;(
            [
              [isComponent, 'component'],
              [isErrorComponent, 'errorComponent'],
              [isPendingComponent, 'pendingComponent'],
              [isLoader, 'loader'],
            ] as const
          ).forEach(([isType, type]) => {
            if (isType) {
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
            isRoute,
            isComponent,
            isErrorComponent,
            isPendingComponent,
            isLoader,
            isLazy,
            isLayout,
            isAPIRoute,
          })
        }
      }),
    )

    return routeNodes
  }

  await recurse('./')

  const rootRouteNode = routeNodes.find((d) => d.routePath === `/${rootPathId}`)
  return { rootRouteNode, routeNodes }
}
