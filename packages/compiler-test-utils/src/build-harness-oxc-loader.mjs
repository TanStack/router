// webpack loader of the build harness (build-harness.ts): compiles
// TypeScript and JSX with Vite's Oxc transformer, as webpack has no built-in
// transform. Options: `{ development: boolean }`.
import { transformWithOxc } from 'vite'

/**
 * @this {{ async: () => (error: Error | null, code?: string) => void, resourcePath: string, getOptions: () => { development?: boolean } }}
 * @param {string} code
 */
export default function oxcLoader(code) {
  const callback = this.async()
  const file = this.resourcePath
  const extension = file.slice(file.lastIndexOf('.') + 1)
  const lang = extension.includes('ts')
    ? extension.endsWith('x')
      ? 'tsx'
      : 'ts'
    : 'jsx'
  transformWithOxc(code, file, {
    lang,
    sourcemap: false,
    jsx: {
      runtime: 'automatic',
      development: this.getOptions().development === true,
    },
  }).then(
    (result) => callback(null, result.code),
    (error) => callback(error),
  )
}
