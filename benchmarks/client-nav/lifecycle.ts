import type {
  AnyRouter,
  NavigateOptions,
  RouterEvents,
} from '@tanstack/router-core'
import { getRequiredLink, waitForRequiredLink } from './setup-helpers'

export type Framework = 'react' | 'solid' | 'vue'

export interface MountedTestApp<TRouter extends AnyRouter = AnyRouter> {
  router: TRouter
  unmount: () => void
}

export type MountTestApp<TRouter extends AnyRouter = AnyRouter> = (
  container: HTMLDivElement,
) => MountedTestApp<TRouter>

export type CleanupFn = () => Promise<void> | void

export type ActionWaitMode = 'rendered' | 'resolved' | 'idle' | 'none'

export interface WaitOptions {
  label?: string
  timeoutMs?: number
}

export interface ActionWaitOptions extends WaitOptions {
  wait?: ActionWaitMode
}

export interface CreateClientNavLifecycleOptions<
  TRouter extends AnyRouter = AnyRouter,
> {
  mountTestApp: MountTestApp<TRouter>
  timeoutMs?: number
  load?: boolean
}

type EventWaiter = {
  resolve: () => void
  reject: (error: Error) => void
}

type ActiveMount<TRouter extends AnyRouter> = {
  container: HTMLDivElement
  router: TRouter
  unmount: () => void
  unsubscribers: Array<() => void>
}

const DEFAULT_TIMEOUT_MS = 2_000

const frameworkNames = {
  react: 'React',
  solid: 'Solid',
  vue: 'Vue',
} satisfies Record<Framework, string>

export function warnClientNavDevMode(framework: Framework) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `client-nav benchmark is running without NODE_ENV=production; ${frameworkNames[framework]} dev overhead will dominate results.`,
    )
  }
}

export function createBenchContainer() {
  const container = document.createElement('div')
  document.body.append(container)

  return container
}

export function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export async function waitWithTimeout<T>(
  value: Promise<T> | T,
  {
    label = 'client-nav wait',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: WaitOptions = {},
) {
  let timeout: ReturnType<typeof setTimeout> | undefined = undefined

  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout)
    }
  }
}

export function createClientNavLifecycle<
  TRouter extends AnyRouter = AnyRouter,
>({
  mountTestApp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  load = true,
}: CreateClientNavLifecycleOptions<TRouter>) {
  let activeMount: ActiveMount<TRouter> | undefined = undefined
  const renderWaiters = new Set<EventWaiter>()
  const resolvedWaiters = new Set<EventWaiter>()
  const cleanups: Array<CleanupFn> = []

  const resolveWaiters = (waiters: Set<EventWaiter>) => {
    const pending = Array.from(waiters)
    waiters.clear()

    for (const waiter of pending) {
      waiter.resolve()
    }
  }

  const rejectWaiters = (error: Error) => {
    const waiters = [...renderWaiters, ...resolvedWaiters]
    renderWaiters.clear()
    resolvedWaiters.clear()

    for (const waiter of waiters) {
      waiter.reject(error)
    }
  }

  const createEventWaiter = (waiters: Set<EventWaiter>) => {
    let waiter: EventWaiter | undefined = undefined
    const promise = new Promise<void>((resolve, reject) => {
      waiter = { resolve, reject }
      waiters.add(waiter)
    })

    return {
      promise,
      cancel() {
        if (waiter) {
          waiters.delete(waiter)
        }
      },
    }
  }

  const getActiveMount = () => {
    if (!activeMount) {
      throw new Error('Client navigation benchmark app is not mounted')
    }

    return activeMount
  }

  const getRouter = () => getActiveMount().router
  const getContainer = () => getActiveMount().container

  const waitForEvent = async (
    eventType: Extract<keyof RouterEvents, 'onRendered' | 'onResolved'>,
    action?: () => Promise<unknown> | unknown,
    options: WaitOptions = {},
  ) => {
    const waiters = eventType === 'onRendered' ? renderWaiters : resolvedWaiters
    const waiter = createEventWaiter(waiters)
    const label = options.label ?? eventType

    try {
      const actionResult = action?.()
      await waitWithTimeout(
        Promise.all([Promise.resolve(actionResult), waiter.promise]),
        { label, timeoutMs: options.timeoutMs ?? timeoutMs },
      )
    } finally {
      waiter.cancel()
    }
  }

  const waitForRouterIdle = (options: WaitOptions = {}) => {
    const router = getRouter()

    return waitForCounter(
      () => (router.state.status === 'idle' && !router.state.isLoading ? 1 : 0),
      1,
      {
        label: options.label ?? 'router idle',
        timeoutMs: options.timeoutMs ?? timeoutMs,
      },
    )
  }

  const waitForAction = async (
    action: () => Promise<unknown> | unknown,
    { wait = 'rendered', ...options }: ActionWaitOptions = {},
  ) => {
    if (wait === 'rendered') {
      await waitForEvent('onRendered', action, options)
      return
    }

    if (wait === 'resolved') {
      await waitForEvent('onResolved', action, options)
      return
    }

    const actionResult = action()

    if (wait === 'idle') {
      await Promise.resolve(actionResult)
      await waitForRouterIdle(options)
      return
    }

    await waitWithTimeout(Promise.resolve(actionResult), {
      label: options.label ?? 'client-nav action',
      timeoutMs: options.timeoutMs ?? timeoutMs,
    })
  }

  const runCleanups = async (errors: Array<unknown>) => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop()!

      try {
        await cleanup()
      } catch (error) {
        errors.push(error)
      }
    }
  }

  async function before() {
    await after()

    const container = createBenchContainer()

    try {
      const { router, unmount } = mountTestApp(container)
      const unsubscribers = [
        router.subscribe('onRendered', () => {
          resolveWaiters(renderWaiters)
        }),
        router.subscribe('onResolved', () => {
          resolveWaiters(resolvedWaiters)
        }),
      ]

      activeMount = {
        container,
        router,
        unmount,
        unsubscribers,
      }

      if (load) {
        await waitWithTimeout(router.load(), {
          label: 'initial router.load()',
          timeoutMs,
        })
      }
    } catch (error) {
      container.remove()
      await after()
      throw error
    }
  }

  async function after() {
    const mount = activeMount
    activeMount = undefined

    const errors: Array<unknown> = []

    if (mount) {
      try {
        mount.unmount()
      } catch (error) {
        errors.push(error)
      }

      for (const unsubscribe of mount.unsubscribers.splice(0).reverse()) {
        try {
          unsubscribe()
        } catch (error) {
          errors.push(error)
        }
      }

      try {
        mount.container.remove()
      } catch (error) {
        errors.push(error)
      }

      try {
        if (
          typeof self !== 'undefined' &&
          self.__TSR_ROUTER__ === mount.router
        ) {
          self.__TSR_ROUTER__ = undefined
        }
      } catch (error) {
        errors.push(error)
      }

      try {
        mount.router.history.destroy()
      } catch (error) {
        errors.push(error)
      }
    }

    rejectWaiters(new Error('Client navigation benchmark app was unmounted'))
    await runCleanups(errors)

    if (errors.length === 1) {
      throw errors[0]
    }

    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        'Client navigation benchmark teardown failed',
      )
    }
  }

  function addCleanup(cleanup: CleanupFn) {
    cleanups.push(cleanup)
    let registered = true

    return () => {
      if (!registered) {
        return
      }

      registered = false
      const index = cleanups.lastIndexOf(cleanup)

      if (index !== -1) {
        cleanups.splice(index, 1)
      }
    }
  }

  function navigate(options: NavigateOptions, waitOptions?: ActionWaitOptions) {
    return waitForAction(() => getRouter().navigate(options), {
      label: 'router.navigate()',
      ...waitOptions,
    })
  }

  function dispatchClick(testId: string) {
    getRequiredLink(getContainer(), testId).dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    )
  }

  function click(testId: string, options: ActionWaitOptions = {}) {
    return waitForAction(() => dispatchClick(testId), {
      label: `click ${testId}`,
      ...options,
    })
  }

  function waitForLink(testId: string) {
    return waitForRequiredLink(getContainer(), testId)
  }

  function waitForCounterWithDefaultTimeout(
    readCounter: () => number,
    target: number | ((value: number) => boolean),
    options?: WaitOptions,
  ) {
    return waitForCounter(readCounter, target, {
      timeoutMs,
      ...options,
    })
  }

  return {
    before,
    after,
    addCleanup,
    click,
    dispatchClick,
    getContainer,
    getRouter,
    navigate,
    waitForCounter: waitForCounterWithDefaultTimeout,
    waitForLink,
    waitForPromise<T>(value: Promise<T> | T, options?: WaitOptions) {
      return waitWithTimeout(value, {
        timeoutMs,
        ...options,
      })
    },
    waitForRender(
      action?: () => Promise<unknown> | unknown,
      options?: WaitOptions,
    ) {
      return waitForEvent('onRendered', action, options)
    },
    waitForResolved(
      action?: () => Promise<unknown> | unknown,
      options?: WaitOptions,
    ) {
      return waitForEvent('onResolved', action, options)
    },
    waitForRouterIdle,
  }
}

export async function waitForCounter(
  readCounter: () => number,
  target: number | ((value: number) => boolean),
  { label = 'counter wait', timeoutMs = DEFAULT_TIMEOUT_MS }: WaitOptions = {},
) {
  let cancelled = false
  const isReady = (value: number) =>
    typeof target === 'number' ? value >= target : target(value)

  try {
    await waitWithTimeout(
      new Promise<void>((resolve) => {
        const check = () => {
          if (cancelled) {
            return
          }

          if (isReady(readCounter())) {
            resolve()
            return
          }

          requestAnimationFrame(() => check())
        }

        check()
      }),
      { label, timeoutMs },
    )
  } finally {
    cancelled = true
  }
}
