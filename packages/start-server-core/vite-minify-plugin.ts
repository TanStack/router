import { transform as esbuildTransform } from 'esbuild'
import type { Plugin } from 'vite'

export default function minifyScriptPlugin(): Plugin {
  return {
    name: 'vite-plugin-minify-script',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('?script-string')) {
        return null
      }

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
  }
}
