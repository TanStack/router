interface PoolConfig {
  concurrency?: number
  started?: boolean
  tasks?: Array<() => Promise<any>>
}

const defaultConfig: PoolConfig = {
  concurrency: 5,
  started: false,
  tasks: [],
}

export class Queue<T> {
  private onSettles: Array<(res: any, error: any) => void> = []
  private running: boolean
  private active: Array<() => Promise<any>> = []
  private pending: Array<() => Promise<any>>
  private currentConcurrency: number

  constructor(config: PoolConfig = defaultConfig) {
    const { concurrency, started, tasks } = {
      ...defaultConfig,
      ...config,
    }
    this.running = started!
    this.pending = tasks as Array<() => Promise<any>>
    this.currentConcurrency = concurrency!
  }

  private tick() {
    if (!this.running) {
      return
    }
    while (
      this.active.length < this.currentConcurrency &&
      this.pending.length
    ) {
      const nextFn = this.pending.shift()
      if (!nextFn) {
        throw new Error('Found task that is not a function')
      }
      this.active.push(nextFn)
      ;(async () => {
        let res!: T
        let error: any
        try {
          res = await nextFn()
        } catch (e) {
          error = e
        }
        this.active = this.active.filter((d) => d !== nextFn)
        this.onSettles.forEach((d) => d(res, error))
        this.tick()
      })()
    }
  }

  add(fn: () => Promise<T> | T, { priority }: { priority?: boolean } = {}) {
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
        this.pending.unshift(task)
      } else {
        this.pending.push(task)
      }
      this.tick()
    })
  }

  onSettled(cb: () => void) {
    this.onSettles.push(cb)
    return () => {
      this.onSettles = this.onSettles.filter((d) => d !== cb)
    }
  }

  start() {
    this.running = true
    this.tick()
    return new Promise<void>((resolve) => {
      this.onSettled(() => {
        if (this.isSettled()) {
          resolve()
        }
      })
    })
  }

  isSettled() {
    return !this.active.length && !this.pending.length
  }
}
