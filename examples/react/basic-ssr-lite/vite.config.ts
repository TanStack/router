import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import * as babel from '@babel/core'
import * as t from '@babel/types'
import * as generator from '@babel/generator'
// import viteBabel from 'vite-plugin-babel'
// import babel from '@rollup/plugin-babel'

export default defineConfig({
  plugins: [
    // babel({
    //   plugins: [myCustomPlugin()],
    // }),
    react(),
    myCustomPlugin(),
  ],
  build: {
    minify: false,
  },
  cacheDir: '.vite',
})

function myCustomPlugin(): Plugin {
  const fileRegex = /\.(js|ts|jsx|tsx)$/

  return {
    name: 'my-custom-plugin',
    // enforce: 'pre',
    transform: async (code, id, opts) => {
      if (!opts?.ssr && fileRegex.test(id)) {
        const res = await babel.transformAsync(code, {
          configFile: false,
          babelrc: false,
          plugins: [myPlugin()],
        })

        return res?.code
      }
    },
  }
}

function myPlugin(): babel.PluginObj {
  return {
    visitor: {
      //
      Identifier(path) {
        if (path.node.name === 'createChildren') {
          const parent = path.parentPath
          const grandParent = parent.parentPath

          // Check that the parent expression is a createRouteConfig()
          if (
            t.isMemberExpression(parent.node) &&
            t.isCallExpression(parent.node.object) &&
            t.isIdentifier(parent.node.object.callee) &&
            t.isCallExpression(grandParent?.node) &&
            t.isFunction(grandParent?.node.arguments[0]) &&
            grandParent?.node.arguments[0].params.length === 1 &&
            t.isIdentifier(grandParent?.node.arguments[0].params[0])
          ) {
            if (
              t.isObjectExpression(parent.node.object.arguments[0]) &&
              t.isCallExpression(grandParent.node)
            ) {
              // Parent is a parent route config
              handleCreateChildrenReturn(grandParent?.node.arguments[0].body)
            } else if (parent.node.object.callee.name === 'createRouteConfig') {
              // Parent is a root route config
              handleCreateChildrenReturn(grandParent?.node.arguments[0].body)
            }
          }

          function handleCreateChildrenReturn(body: any) {
            if (t.isBlockStatement(body) && t.isReturnStatement(body.body[0])) {
              if (t.isArrayExpression(body.body[0].argument)) {
                handleRoutesArray(body.body[0].argument?.elements)
              }
            } else if (t.isArrayExpression(body)) {
              handleRoutesArray(body.elements)
            }
          }

          function handleRoutesArray(routesArray: any[]) {
            if (!routesArray) {
              return
            }

            routesArray.forEach((element) => {
              if (t.isIdentifier(element)) {
                const binding = path.scope.getBinding(element.name)
                if (t.isVariableDeclarator(binding?.path.node)) {
                  handleCreateRoute(binding?.path.node.init)
                }
              } else {
                handleCreateRoute(element)
              }
            })
          }

          function handleCreateRoute(node: any) {
            if (
              t.isCallExpression(node) &&
              t.isIdentifier(node.callee) &&
              t.isObjectExpression(node.arguments[0])
            ) {
              const routeOptionsObj = node.arguments[0]
              routeOptionsObj.properties.forEach((property) => {
                if (
                  t.isObjectProperty(property) &&
                  t.isIdentifier(property.key) &&
                  property.key.name === 'loader'
                ) {
                  property.value = t.objectExpression([
                    t.objectProperty(
                      t.identifier('loader'),
                      t.booleanLiteral(true),
                    ),
                  ])
                }
              })
            } else if (
              t.isCallExpression(node) &&
              t.isMemberExpression(node.callee) &&
              t.isCallExpression(node.callee.object)
            ) {
              handleCreateRoute(node.callee.object)
            }
          }
        }
      },
    },
  }
}

function test() {}
