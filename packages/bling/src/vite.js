/**
 * @returns {import('vite').Plugin}
 * @param {{ lazy?: any; restart?: any; reload?: any; ssr?: any; appRoot?: any; routesDir?: any; delay?: any; glob?: any; router?: any; babel?: any }} options
 */
import viteReact from '@vitejs/plugin-react'
import { fileURLToPath, pathToFileURL } from 'url'
import babel from './babel.js'
export function bling(options = {}) {
  return {
    name: 'solid-start-file-system-router',
    enforce: 'pre',

    transform(code, id, transformOptions) {
      const isSsr =
        transformOptions === null || transformOptions === void 0
          ? void 0
          : transformOptions.ssr

      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      const babelOptions =
        (fn) =>
        (...args) => {
          const b =
            typeof options.babel === 'function'
              ? options.babel(...args)
              : options.babel ?? { plugins: [] }
          const d = fn(...args)
          return {
            plugins: [...b.plugins, ...d.plugins],
          }
        }
      let babelSolidCompiler = (code, id, fn) => {
        let plugin = viteReact({
          ...(options ?? {}),
          babel: babelOptions(fn),
        })

        // @ts-ignore
        return plugin[0].transform(code, id, transformOptions)
      }

      let ssr = process.env.TEST_ENV === 'client' ? false : isSsr

      if (code.includes('server$')) {
        return babelSolidCompiler(
          code,
          id.replace(/\.ts$/, '.tsx').replace(/\.js$/, '.jsx'),
          (/** @type {any} */ source, /** @type {any} */ id) => ({
            plugins: [
              [
                babel,
                {
                  ssr,
                  root: process.cwd(),
                  minify: process.env.NODE_ENV === 'production',
                },
              ],
            ].filter(Boolean),
          }),
        )
      }
    },
  }
}

export default bling
