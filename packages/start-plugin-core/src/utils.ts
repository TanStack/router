import * as vite from 'vite'

/**
 * Vite 8+ uses Rolldown instead of Rollup, renaming `build.rollupOptions`
 * to `build.rolldownOptions`. Detect which bundler is in use.
 */
export const isRolldown = 'rolldownVersion' in vite

/** Returns `'rolldownOptions'` when using Rolldown, `'rollupOptions'` otherwise. */
export const bundlerOptionsKey = isRolldown
  ? 'rolldownOptions'
  : 'rollupOptions'

/** Read `build.rollupOptions` or `build.rolldownOptions` from a build config. */
export function getBundlerOptions(build: any): any {
  return build?.rolldownOptions ?? build?.rollupOptions
}

export function resolveViteId(id: string) {
  return `\0${id}`
}

export function createLogger(prefix: string) {
  const label = `[${prefix}]`
  return {
    log: (...args: any) => console.log(label, ...args),
    debug: (...args: any) => console.debug(label, ...args),
    info: (...args: any) => console.info(label, ...args),
    warn: (...args: any) => console.warn(label, ...args),
    error: (...args: any) => console.error(label, ...args),
  }
}
