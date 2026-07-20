import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Generator, getConfig } from '@tanstack/router-generator'
import {
  buildServerRouteTree,
  pruneServerRoutePieces,
} from '../src/start-router-plugin/server-route-tree'
import type {
  HandleNodeAccumulator,
  RouteNode,
} from '@tanstack/router-generator'

function createRouteNode(
  routePath: string,
  serverSsr: true | false | 'data-only' | undefined,
) {
  return {
    filePath: `${routePath}.tsx`,
    fullPath: `${routePath}.tsx`,
    variableName: routePath,
    routePath,
    _fsRouteType: 'static' as const,
    serverSsr,
  }
}

function createPiece(name: string): RouteNode {
  return {
    filePath: `${name}.tsx`,
    fullPath: `${name}.tsx`,
    variableName: name,
    _fsRouteType: 'component',
  }
}

describe('pruneServerRoutePieces', () => {
  it('removes only route pieces unavailable to server rendering', () => {
    const rootRouteNode = createRouteNode('/__root', 'data-only')
    const noneRoute = createRouteNode('/none', false)
    const dataRoute = createRouteNode('/data', 'data-only')
    const fullRoute = createRouteNode('/full', true)
    const unknownRoute = createRouteNode('/unknown', undefined)
    const component = createPiece('component')
    const loader = createPiece('loader')
    const pendingComponent = createPiece('pendingComponent')
    const routePieces = { component, loader, pendingComponent }
    const acc: HandleNodeAccumulator = {
      routeTree: [],
      routeNodes: [noneRoute, dataRoute, fullRoute, unknownRoute],
      routeNodesByPath: new Map([
        ['/none', noneRoute],
        ['/data', dataRoute],
        ['/full', fullRoute],
        ['/unknown', unknownRoute],
      ]),
      routePiecesByPath: {
        '/__root': routePieces,
        '/none': routePieces,
        '/data': routePieces,
        '/full': routePieces,
        '/unknown': routePieces,
      },
    }

    const result = pruneServerRoutePieces({ rootRouteNode, acc })

    expect(result.routePiecesByPath['/__root']).toEqual({
      loader,
      pendingComponent,
    })
    expect(result.routePiecesByPath['/none']).toEqual({
      pendingComponent,
    })
    expect(result.routePiecesByPath['/data']).toEqual({
      loader,
      pendingComponent,
    })
    expect(result.routePiecesByPath['/full']).toBe(routePieces)
    expect(result.routePiecesByPath['/unknown']).toBe(routePieces)
    expect(acc.routePiecesByPath['/none']).toBe(routePieces)
  })

  it('emits only route-piece imports available to server rendering', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tsr-server-tree-'))
    const routesDirectory = path.join(root, 'routes')
    await fs.mkdir(routesDirectory)

    const piece = (routeId: string, name: string) =>
      `export const Route = createFileRoute('${routeId}')({}); export const ${name} = () => null`
    const routeFiles = {
      '__root.tsx': 'export const Route = createRootRoute({ ssr: true })',
      '__root.component.tsx': piece('/__root', 'component'),
      '__root.pendingComponent.tsx': piece('/__root', 'pendingComponent'),
      'none.tsx':
        "export const Route = createFileRoute('/none')({ ssr: false })",
      'none.component.tsx': piece('/none', 'component'),
      'none.loader.ts': piece('/none', 'loader'),
      'none.errorComponent.tsx': piece('/none', 'errorComponent'),
      'none.notFoundComponent.tsx': piece('/none', 'notFoundComponent'),
      'none.pendingComponent.tsx': piece('/none', 'pendingComponent'),
      'none.lazy.tsx': "export const Route = createLazyFileRoute('/none')({})",
      'data.tsx':
        "export const Route = createFileRoute('/data')({ ssr: 'data-only' })",
      'data.component.tsx': piece('/data', 'component'),
      'data.loader.ts': piece('/data', 'loader'),
      'full.tsx':
        "export const Route = createFileRoute('/full')({ ssr: true })",
      'full.component.tsx': piece('/full', 'component'),
      'full.loader.ts': piece('/full', 'loader'),
      'unknown.tsx':
        "export const Route = createFileRoute('/unknown')({ ssr: () => false })",
      'unknown.component.tsx': piece('/unknown', 'component'),
      'unknown.loader.ts': piece('/unknown', 'loader'),
    }

    try {
      await Promise.all(
        Object.entries(routeFiles).map(([filename, content]) =>
          fs.writeFile(path.join(routesDirectory, filename), content),
        ),
      )
      const generator = new Generator({
        root,
        config: getConfig(
          {
            disableLogging: true,
            routesDirectory,
            generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
            routeTreeFileFooter: ['const serverFooter = true'],
          },
          root,
        ),
      })

      await generator.run()
      const { code } = await buildServerRouteTree(generator)
      expect(code).toContain('const serverFooter = true')
      const imports = new Set(
        [...code.matchAll(/import\('([^']+)'\)/g)].map((match) => match[1]),
      )

      const expectedImports = new Set([
        './routes/__root.component',
        './routes/__root.pendingComponent',
        './routes/none.errorComponent',
        './routes/none.notFoundComponent',
        './routes/none.pendingComponent',
        './routes/none.lazy',
        './routes/data.loader',
        './routes/full.component',
        './routes/full.loader',
        './routes/unknown.component',
        './routes/unknown.loader',
      ])
      expect(imports).toEqual(expectedImports)

      await fs.writeFile(
        path.join(routesDirectory, 'full.tsx'),
        "export const Route = createFileRoute('/full')({ ssr: false })",
      )
      await generator.run()
      const updatedTree = await buildServerRouteTree(generator)
      const updatedImports = new Set(
        [...updatedTree.code.matchAll(/import\('([^']+)'\)/g)].map(
          (match) => match[1],
        ),
      )
      expectedImports.delete('./routes/full.component')
      expectedImports.delete('./routes/full.loader')
      expect(updatedImports).toEqual(expectedImports)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
