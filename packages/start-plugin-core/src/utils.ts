import * as vite from 'vite'

/**
 * Vite 8 renamed `build.rollupOptions` to `build.rolldownOptions`.
 * Detect which version is running so we can set/read the correct key.
 */
export const isVite8 = 'rolldownVersion' in vite

/** Returns `'rolldownOptions'` on Vite 8+, `'rollupOptions'` on Vite 7. */
export const bundlerOptionsKey = (
  isVite8 ? 'rolldownOptions' : 'rollupOptions'
)

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
