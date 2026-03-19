import * as vite from 'vite'

/**
 * Vite 7 also exports `rolldownVersion`, so feature detection on that export is
 * not enough to tell which build config key Vite expects.
 */
export function usesRolldown(viteVersion: string): boolean {
  const viteMajorVersion = Number.parseInt(viteVersion.split('.')[0] ?? '', 10)

  return Number.isFinite(viteMajorVersion) && viteMajorVersion >= 8
}

/**
 * Vite 8+ uses Rolldown instead of Rollup, renaming `build.rollupOptions`
 * to `build.rolldownOptions`.
 */
export const isRolldown = usesRolldown(vite.version)

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
