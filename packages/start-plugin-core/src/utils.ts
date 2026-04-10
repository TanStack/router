/** Read `build.rollupOptions` or `build.rolldownOptions` from a build config. */
export function getBundlerOptions(build: any): any {
  return build?.rolldownOptions ?? build?.rollupOptions
}

export function resolveViteId(id: string) {
  return `\0${id}`
}

export function createLogger(prefix: string): {
  log: (...args: any) => void
  debug: (...args: any) => void
  info: (...args: any) => void
  warn: (...args: any) => void
  error: (...args: any) => void
} {
  const label = `[${prefix}]`
  return {
    log: (...args: any): void => console.log(label, ...args),
    debug: (...args: any): void => console.debug(label, ...args),
    info: (...args: any): void => console.info(label, ...args),
    warn: (...args: any): void => console.warn(label, ...args),
    error: (...args: any): void => console.error(label, ...args),
  }
}
