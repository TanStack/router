import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import * as babel from '@babel/core'
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
  return {
    name: 'my-custom-plugin',
    transform: async (code, id, ssr) => {
      console.log(ssr)
      if (code.includes('@tanstack')) {
        const res = await babel.transformAsync(code, {
          configFile: false,
          babelrc: false,
          plugins: [myBabelPlugin()],
        })

        return code
      }
    },
  }
}

function myBabelPlugin(): babel.PluginObj {
  return {
    visitor: {
      // Identifier(path) {
      //   console.log(path)
      // },
      // Program(path) {
      //   console.log(path.getSource())
      // },
      Identifier(path) {
        if (path.node.name === 'createRoute') {
          console.log(path)
        }
      },
      // Identifier(path) {
      //   if (path.node.name === 'createRouteConfig') {
      //     console.log('identifier', path)
      //   }
      // },
    },
  }
}

function test() {}
