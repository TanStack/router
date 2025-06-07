import { transform as esbuildTransform } from 'esbuild'
import type { Plugin } from 'vite'

export default function minifyScriptPlugin(): Plugin {
  return {
    name: 'vite-plugin-minify-script',
    enforce: 'pre',
    transform: {
      filter: { id: /\?script-string$/ },
      async handler(code) {
        const result = await esbuildTransform(code, {
          loader: 'ts',
          minify: true,
          target: 'esnext',
        })

        return {
          code: `export default ${JSON.stringify(result.code)};`,
          map: null,
        }
      },
    },
  }
}
