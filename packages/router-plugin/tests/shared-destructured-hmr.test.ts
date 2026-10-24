import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as babel from '@babel/core'
import * as t from '@babel/types'
import * as router from '@tanstack/react-router'
import { generateFromAst, parseAst } from '@tanstack/router-utils'
import { createElement } from 'react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { tanstackRouter } from '../src/vite'
import type { Plugin } from 'vite'

// Evaluate emitted modules with ordinary module imports and a persistent HMR
// data object. Only module syntax/import.meta are lowered; router code is real.
function evaluateModule(
  code: string,
  modules: Record<string, any>,
  hot: {
    data: Record<string, unknown>
    accept: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  },
) {
  const ast = parseAst({ code })
  const exports: Array<t.ObjectProperty> = []
  babel.traverse(ast, {
    ImportDeclaration(importPath) {
      const properties = importPath.node.specifiers.map((specifier) => {
        t.assertImportSpecifier(specifier)
        return t.objectProperty(specifier.imported, specifier.local)
      })
      importPath.replaceWith(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.objectPattern(properties),
            t.memberExpression(
              t.identifier('modules'),
              importPath.node.source,
              true,
            ),
          ),
        ]),
      )
    },
    ExportNamedDeclaration(exportPath) {
      const declaration = exportPath.node.declaration
      if (declaration) {
        for (const name of Object.keys(t.getBindingIdentifiers(declaration))) {
          exports.push(t.objectProperty(t.identifier(name), t.identifier(name)))
        }
        exportPath.replaceWith(declaration)
      } else {
        for (const specifier of exportPath.node.specifiers) {
          t.assertExportSpecifier(specifier)
          exports.push(t.objectProperty(specifier.exported, specifier.local))
        }
        exportPath.remove()
      }
    },
    MetaProperty(metaPath) {
      metaPath.replaceWith(t.identifier('importMeta'))
    },
    CallExpression(callPath) {
      if (t.isImport(callPath.node.callee)) {
        callPath.node.callee = t.identifier('load')
      }
    },
  })
  ast.program.body.push(t.returnStatement(t.objectExpression(exports)))
  return new Function(
    'modules',
    'importMeta',
    'load',
    generateFromAst(ast).code,
  )(modules, { hot, webpackHot: hot }, (id: string) =>
    Promise.resolve(modules[id]),
  )
}

async function createCompiler(source: string, hmrStyle: 'vite' | 'webpack') {
  const root = await mkdtemp(path.join(tmpdir(), 'router-shared-hmr-test-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const routes = path.join(root, 'routes')
  await mkdir(routes)
  await writeFile(
    path.join(routes, '__root.tsx'),
    `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()`,
  )
  const filename = path.join(routes, 'hmr-probe.tsx')
  await writeFile(filename, source)
  const result = tanstackRouter({
    target: 'react',
    autoCodeSplitting: true,
    routesDirectory: routes,
    generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
    plugin: { hmr: { style: hmrStyle } },
  })
  const plugins = (Array.isArray(result) ? result : [result]) as Array<Plugin>
  // The public generator populates route ownership from real source files.
  // No routing context, shared-binding map or compiler state is modified here.
  for (const plugin of plugins) {
    const hook = plugin.configResolved
    if (hook) {
      const handler = typeof hook === 'function' ? hook : hook.handler
      await handler.call(
        {} as never,
        { root, command: 'serve', plugins } as never,
      )
    }
  }
  return {
    filename,
    async compile(
      code: string,
      kind: 'reference' | 'virtual' | 'shared',
      query = '',
    ) {
      const plugin = plugins.find(
        (item) =>
          item.name === `tanstack-router:code-splitter:compile-${kind}-file`,
      )!
      const transform = plugin.transform!
      const handler =
        typeof transform === 'function' ? transform : transform.handler
      const result = await handler.call(
        {} as never,
        code,
        `${filename}${query}`,
      )
      if (
        !result ||
        typeof result === 'string' ||
        typeof result.code !== 'string'
      ) {
        throw new Error(`Expected compiled ${kind} module`)
      }
      return result.code
    },
  }
}

describe('shared destructuring with React route HMR', () => {
  it.each([
    { hmrStyle: 'vite', alias: false },
    { hmrStyle: 'webpack', alias: false },
    { hmrStyle: 'vite', alias: true },
    { hmrStyle: 'webpack', alias: true },
  ] as const)(
    'initializes once and preserves identity with $hmrStyle HMR (alias=$alias)',
    async ({ hmrStyle, alias }) => {
      const fixture = await readFile(
        new URL(
          './code-splitter/test-files/react/shared-destructured-hmr.tsx',
          import.meta.url,
        ),
        'utf8',
      )
      const source = alias
        ? fixture
            .replace('{ read, render }', '{ read, render: pending }')
            .replace('() => render()', '() => pending()')
            .replace('pendingComponent: render', 'pendingComponent: pending')
        : fixture
      const compiler = await createCompiler(source, hmrStyle)
      const referenceCode = await compiler.compile(source, 'reference')
      const sharedCode = await compiler.compile(
        source,
        'shared',
        '?tsr-shared=1',
      )
      const virtualCode = await compiler.compile(
        source,
        'virtual',
        '?tsr-split=component',
      )
      const makeHelpers = vi.fn(() => {
        const state = { value: 'shared instance' }
        return {
          read: () => state,
          render: () => createElement('div', { 'data-state': state }),
        }
      })
      const modules: Record<string, any> = {
        '@tanstack/react-router': router,
        '../helpers': { makeHelpers },
      }
      const hot = { data: {}, accept: vi.fn(), dispose: vi.fn() }
      const shared = evaluateModule(sharedCode, modules, hot)
      modules[`${compiler.filename}?tsr-shared=1`] = shared
      const split = evaluateModule(virtualCode, modules, hot)
      modules[`${compiler.filename}?tsr-split=component`] = split
      const { Route } = evaluateModule(referenceCode, modules, hot)
      const state = Route.options.loader()
      expect(Route.options.pendingComponent).toBe(
        shared[alias ? 'pending' : 'render'],
      )
      expect(Route.options.pendingComponent().props['data-state']).toBe(state)
      expect(split.component().props['data-state']).toBe(state)
      await Route.options.component.preload()
      expect(Route.options.component({}).type).toBe(split.component)
      expect(makeHelpers).toHaveBeenCalledTimes(1)

      const updated = source.replace(
        'loader: () => read()',
        'loader: () => ({ state: read(), updated: true })',
      )
      const updatedCode = await compiler.compile(updated, 'reference')
      expect(await compiler.compile(updated, 'shared', '?tsr-shared=1')).toBe(
        sharedCode,
      )
      const { Route: refreshed } = evaluateModule(updatedCode, modules, hot)
      expect(refreshed.options.loader()).toEqual({ state, updated: true })
      expect(refreshed.options.loader().state).toBe(state)
      expect(refreshed.options.component).toBe(Route.options.component)
      expect(refreshed.options.pendingComponent).toBe(
        Route.options.pendingComponent,
      )
      expect(makeHelpers).toHaveBeenCalledTimes(1)
      expect(hot.accept).toHaveBeenCalled()
    },
  )
})
