import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { parseAst } from '@tanstack/router-utils'
import { routesManifestPlugin } from '../src/start-router-plugin/generator-plugins/routes-manifest-plugin'
import type * as t from '@babel/types'
import type { RouteNode } from '@tanstack/router-generator'

beforeEach(() => vi.stubGlobal('TSS_ROUTES_MANIFEST', undefined))
afterEach(() => vi.unstubAllGlobals())

function generateManifest(
  plugin: ReturnType<typeof routesManifestPlugin>,
  props: ReadonlyArray<string> | undefined,
) {
  const rootRouteNode: RouteNode = {
    filePath: '__root.tsx',
    fullPath: '/routes/__root.tsx',
    variableName: 'root',
    _fsRouteType: '__root',
  }
  const child: RouteNode = {
    filePath: 'child.tsx',
    fullPath: '/routes/child.tsx',
    routePath: '/child',
    variableName: 'child',
    _fsRouteType: 'static',
    createFileRouteProps: props && new Set(props),
  }
  plugin.onRouteTreeChanged!({
    rootRouteNode,
    routeTree: [child],
    routeNodes: [child],
    acc: {
      routeTree: [child],
      routeNodes: [child],
      routePiecesByPath: {},
      routeNodesByPath: new Map([['/child', child]]),
    },
  })
  return plugin
}

test.each([
  [false, ['component'], true],
  [true, ['server'], true],
  [true, ['component', 'server'], true],
  [true, ['component'], undefined],
  [true, undefined, true],
] as const)(
  'collects the server flag during route manifest generation (build: %s, props: %s)',
  (isBuild, props, hasServerRoutes) => {
    generateManifest(
      routesManifestPlugin(() => isBuild),
      props,
    )

    expect(globalThis.TSS_ROUTES_MANIFEST).toEqual({
      routes: {
        __root__: {
          filePath: '/routes/__root.tsx',
          children: ['/child'],
        },
        '/child': {
          filePath: '/routes/child.tsx',
          children: undefined,
        },
      },
      hasServerRoutes,
    })
  },
)

function observeOptions(
  plugin: ReturnType<typeof routesManifestPlugin>,
  createRouteFn: string,
  properties: string,
  id = '/routes/__root.tsx',
) {
  const ast = parseAst({ code: `({ ${properties} })` })
  const statement = ast.program.body[0] as t.ExpressionStatement
  plugin.onRouteOptions!({
    routeOptions: statement.expression as t.ObjectExpression,
    createRouteFn,
    opts: { id },
  } as Parameters<NonNullable<typeof plugin.onRouteOptions>>[0])
}

test.each(['createRootRoute', 'createRootRouteWithContext'])(
  '%s without server options completes build-time detection',
  (createRouteFn) => {
    const plugin = generateManifest(
      routesManifestPlugin(() => true),
      [],
    )
    const manifest = globalThis.TSS_ROUTES_MANIFEST
    observeOptions(
      plugin,
      'createFileRoute',
      'component: Page',
      '/routes/child.tsx',
    )
    expect(globalThis.TSS_ROUTES_MANIFEST?.hasServerRoutes).toBeUndefined()
    observeOptions(plugin, createRouteFn, 'component: Page')
    expect(globalThis.TSS_ROUTES_MANIFEST?.hasServerRoutes).toBe(false)
    expect(globalThis.TSS_ROUTES_MANIFEST).toBe(manifest)
  },
)

test.each([
  'server: {}',
  '"server": {}',
  'get server() { return {} }',
  '...options',
  '[key]: options',
])('keeps server handling for route options with %s', (properties) => {
  const plugin = generateManifest(
    routesManifestPlugin(() => true),
    [],
  )
  observeOptions(plugin, 'createRootRoute', 'component: Page')
  observeOptions(plugin, 'createFileRoute', properties, '/routes/child.tsx')
  expect(globalThis.TSS_ROUTES_MANIFEST?.hasServerRoutes).toBe(true)
  observeOptions(plugin, 'createRootRoute', 'component: Page')
  expect(globalThis.TSS_ROUTES_MANIFEST?.hasServerRoutes).toBe(true)
})

test('detects server options on the root route', () => {
  const plugin = generateManifest(
    routesManifestPlugin(() => true),
    [],
  )
  observeOptions(plugin, 'createRootRoute', 'server: { middleware: [] }')
  expect(globalThis.TSS_ROUTES_MANIFEST?.hasServerRoutes).toBe(true)
})

test('a root constructor in another route does not complete detection', () => {
  const plugin = generateManifest(
    routesManifestPlugin(() => true),
    [],
  )
  observeOptions(
    plugin,
    'createRootRoute',
    'component: Page',
    '/routes/child.tsx',
  )
  expect(globalThis.TSS_ROUTES_MANIFEST?.hasServerRoutes).toBeUndefined()
})

test('reads the build mode when generating the manifest', () => {
  let isBuild = false
  const plugin = routesManifestPlugin(() => isBuild)
  isBuild = true
  generateManifest(plugin, [])
  expect(globalThis.TSS_ROUTES_MANIFEST?.hasServerRoutes).toBeUndefined()
  observeOptions(plugin, 'createRootRoute', 'component: Page')
  expect(globalThis.TSS_ROUTES_MANIFEST?.hasServerRoutes).toBe(false)

  isBuild = false
  generateManifest(plugin, [])
  observeOptions(plugin, 'createRootRoute', 'component: Page')
  expect(globalThis.TSS_ROUTES_MANIFEST?.hasServerRoutes).toBe(true)
})

test('each plugin updates its own generated manifest', () => {
  const firstPlugin = generateManifest(
    routesManifestPlugin(() => true),
    [],
  )
  const firstManifest = globalThis.TSS_ROUTES_MANIFEST
  generateManifest(
    routesManifestPlugin(() => true),
    [],
  )
  const secondManifest = globalThis.TSS_ROUTES_MANIFEST

  observeOptions(firstPlugin, 'createRootRoute', 'server: {}')
  expect(firstManifest?.hasServerRoutes).toBe(true)
  expect(secondManifest?.hasServerRoutes).toBeUndefined()
  expect(globalThis.TSS_ROUTES_MANIFEST).toBe(secondManifest)
})
