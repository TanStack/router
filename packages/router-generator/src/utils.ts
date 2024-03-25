export function cleanPath(path: string) {
  // remove double slashes
  return path.replace(/\/{2,}/g, '/')
}

export function trimPathLeft(path: string) {
  return path === '/' ? path : path.replace(/^\/{1,}/, '')
}

export function logging(config: { disabled: boolean }) {
  return {
    log: (...args: Array<any>) => {
      if (!config.disabled) console.log(...args)
    },
    debug: (...args: Array<any>) => {
      if (!config.disabled) console.debug(...args)
    },
    info: (...args: Array<any>) => {
      if (!config.disabled) console.info(...args)
    },
    warn: (...args: Array<any>) => {
      if (!config.disabled) console.warn(...args)
    },
    error: (...args: Array<any>) => {
      if (!config.disabled) console.error(...args)
    },
  }
}
