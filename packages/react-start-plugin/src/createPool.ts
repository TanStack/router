interface PoolConfig {
  concurrency?: number
  started?: boolean
  tasks?: Array<() => Promise<any>>
}
interface PoolAPI<T> {
  add: (
    fn: () => Promise<T> | T,
    options?: { priority?: boolean },
  ) => Promise<T>
  throttle: (n: number) => void
  onSettled: (cb: () => void) => () => void
  onError: (cb: (error: any, task: () => Promise<any>) => void) => () => void
  onSuccess: (cb: (result: any, task: () => Promise<any>) => void) => () => void
  stop: () => void
  start: () => Promise<void>
  clear: () => void
  getActive: () => Array<() => Promise<any>>
  getPending: () => Array<() => Promise<any>>
  getAll: () => Array<() => Promise<any>>
  isRunning: () => boolean
  isSettled: () => boolean
}
const defaultConfig: PoolConfig = {
  concurrency: 5,
  started: false,
  tasks: [],
}

export function createPool<T>(config: PoolConfig = defaultConfig): PoolAPI<T> {
  const { concurrency, started, tasks } = {
    ...defaultConfig,
    ...config,
  }

  let onSettles: Array<(res: any, error: any) => void> = []
  let onErrors: Array<(error: any, task: () => Promise<any>) => void> = []
  let onSuccesses: Array<(result: any, task: () => Promise<any>) => void> = []
  let running = started!
  let active: Array<() => Promise<any>> = []
  let pending: Array<() => Promise<any>> = tasks as Array<() => Promise<any>>
  let currentConcurrency = concurrency!

  const tick = () => {
    if (!running) {
      return
    }
    while (active.length < currentConcurrency && pending.length) {
      const nextFn = pending.shift()
      if (!nextFn) {
        throw new Error('Found task that is not a function')
      } // Safety check
      active.push(nextFn)
      ;(async () => {
        let success = false
        let res!: T
        let error: any
        try {
          res = await nextFn()
          success = true
        } catch (e) {
          error = e
        }
        active = active.filter((d) => d !== nextFn)
        if (success) {
          onSuccesses.forEach((d) => d(res, nextFn))
        } else {
          onErrors.forEach((d) => d(error, nextFn))
        }
        onSettles.forEach((d) => d(res, error))
        tick()
      })()
    }
  }

  const api: PoolAPI<T> = {
    add: (fn, { priority } = {}) => {
      return new Promise<any>((resolve, reject) => {
        const task = () =>
          Promise.resolve(fn())
            .then((res) => {
              resolve(res)
              return res
            })
            .catch((err) => {
              reject(err)
              throw err
            })
        if (priority) {
          pending.unshift(task)
        } else {
          pending.push(task)
        }
        tick()
      })
    },
    throttle: (n) => {
      currentConcurrency = n
    },
    onSettled: (cb) => {
      onSettles.push(cb)
      return () => {
        onSettles = onSettles.filter((d) => d !== cb)
      }
    },
    onError: (cb) => {
      onErrors.push(cb)
      return () => {
        onErrors = onErrors.filter((d) => d !== cb)
      }
    },
    onSuccess: (cb) => {
      onSuccesses.push(cb)
      return () => {
        onSuccesses = onSuccesses.filter((d) => d !== cb)
      }
    },
    stop: () => {
      running = false
    },
    start: () => {
      running = true
      tick()
      return new Promise<void>((resolve) => {
        api.onSettled(() => {
          if (api.isSettled()) {
            resolve()
          }
        })
      })
    },
    clear: () => {
      pending = []
    },
    getActive: () => active,
    getPending: () => pending,
    getAll: () => [...active, ...pending],
    isRunning: () => running,
    isSettled: () => !active.length && !pending.length,
  }

  return api
}
