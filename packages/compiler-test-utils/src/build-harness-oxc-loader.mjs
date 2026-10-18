// webpack loader of the build harness (build-harness.ts): compiles
// TypeScript and JSX with Vite's Oxc transformer, as webpack has no built-in
// transform. Options: `{ development: boolean, importSource?: string }`.
// Like a real loader, it emits a source map, composed with the map of the
// loaders before it (e.g. a plugin's transform), so that webpack's source
// maps point at the original source.
import { transformWithOxc } from 'vite'

/**
 * @this {{ async: () => (error: Error | null, code?: string, map?: object) => void, resourcePath: string, getOptions: () => { development?: boolean, importSource?: string } }}
 * @param {string} code
 * @param {object | string | undefined} inputMap
 */
export default function oxcLoader(code, inputMap) {
  const callback = this.async()
  const file = this.resourcePath
  const extension = file.slice(file.lastIndexOf('.') + 1)
  const options = this.getOptions()
  const lang = extension.includes('ts')
    ? extension.endsWith('x')
      ? 'tsx'
      : 'ts'
    : 'jsx'
  transformWithOxc(
    code,
    file,
    {
      lang,
      sourcemap: true,
      jsx: {
        runtime: 'automatic',
        development: options.development === true,
        importSource: options.importSource ?? 'react',
      },
    },
    typeof inputMap === 'string' ? JSON.parse(inputMap) : inputMap,
  ).then(
    (result) => callback(null, result.code, result.map),
    (error) => callback(error),
  )
}
