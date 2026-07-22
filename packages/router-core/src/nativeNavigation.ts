import { parseHref } from '@tanstack/history'
import { executeRewriteInput } from './rewrite'
import { functionalUpdate, isPromise } from './utils'
import type { ParsedHistoryState } from '@tanstack/history'
import type { NavigateFn } from './RouterProvider'
import type { NavigateOptionProps, NavigateOptions } from './link'
import type { AnyRouter, BackOptions, BuildNextOptions } from './router'

type AnyNavigateOptions = NavigateOptions<any, any, any, any, any>

/** Build an internal router location from a prebuilt href. */
export function buildLocationFromHref(
  router: AnyRouter,
  href: string,
  options: BuildNextOptions = {},
) {
  const { href: _href, ...rest } = options
  const parsed = parseHref(href, undefined)
  const hrefUrl = new URL(parsed.pathname, router.origin)
  const rewrittenUrl = executeRewriteInput(router.rewrite, hrefUrl)

  return router.buildLocation({
    ...rest,
    to: rewrittenUrl.pathname,
    search: router.options.parseSearch(parsed.search),
    hash: parsed.hash.slice(1),
  } as never)
}

function buildNavigationLocation(
  router: AnyRouter,
  options: AnyNavigateOptions,
) {
  if (options.href) {
    return buildLocationFromHref(router, String(options.href), {
      ...options,
      _includeValidateSearch: true,
    } as BuildNextOptions)
  }

  return router.buildLocation({
    ...options,
    _includeValidateSearch: true,
  } as never)
}

async function goToHistoryIndex(
  router: AnyRouter,
  index: number,
  ignoreBlocker?: boolean,
): Promise<void> {
  const currentIndex = router.history.location.state.__TSR_index
  const delta = index - currentIndex
  if (!delta) {
    return
  }

  let historyNotified = false
  let resolveHistoryNotification!: () => void
  const historyNotification = new Promise<void>((resolve) => {
    resolveHistoryNotification = resolve
  })
  const unsubscribe = router.history.subscribe(() => {
    historyNotified = true
    resolveHistoryNotification()
  })
  let historyResult: void | Promise<void>

  try {
    historyResult = router.history.go(delta, {
      ignoreBlocker,
    }) as unknown as void | Promise<void>

    const hasAsyncResult = isPromise(historyResult)
    if (hasAsyncResult) {
      await historyResult
    }

    if (
      !historyNotified &&
      router.history.location.state.__TSR_index === currentIndex
    ) {
      if (hasAsyncResult) {
        return
      }

      await historyNotification
    }
  } finally {
    unsubscribe()
  }

  const loadPromise = router.latestLoadPromise

  if (router.history.location.state.__TSR_index === currentIndex) {
    await loadPromise
    return
  }

  if (loadPromise) {
    await loadPromise
    return
  }

  await router.load({ action: { type: 'GO' } })
}

/** Apply host-neutral native stack semantics, then commit through the router. */
export async function navigateWithStack(
  router: AnyRouter,
  options: AnyNavigateOptions,
  navigate: NavigateFn = router.navigate,
): Promise<void> {
  const {
    to,
    href,
    stackBehavior = 'auto',
    stackMatch = 'nearest',
    entryId,
    native,
    ...nextOptions
  } = options as AnyNavigateOptions & NavigateOptionProps

  if (stackBehavior === 'replace') {
    nextOptions.replace = true
  } else if (stackBehavior === 'push') {
    nextOptions.replace = false
  }

  let resolvedEntryId = entryId
  if (stackBehavior === 'reuse') {
    const targetLocation = buildNavigationLocation(router, {
      ...nextOptions,
      href,
      to,
    } as AnyNavigateOptions)
    resolvedEntryId ??= targetLocation.href

    const currentIndex = router.history.location.state.__TSR_index
    const entries = router.history.getEntries?.()
    const currentEntry = entries?.[currentIndex]
    const currentEntryId =
      currentEntry?.state.__TSR_entryId ?? currentEntry?.href

    if (currentEntry && currentEntryId === resolvedEntryId) {
      const hasStateUpdate =
        nextOptions.state !== undefined || native?.minStackState !== undefined
      if (currentEntry.href === targetLocation.href && !hasStateUpdate) {
        return
      }
      nextOptions.replace = true
    } else {
      let matchingIndex: number | undefined
      if (stackMatch === 'oldest') {
        for (let index = 0; index < currentIndex; index++) {
          const entry = entries?.[index]
          if (
            entry &&
            (entry.state.__TSR_entryId ?? entry.href) === resolvedEntryId
          ) {
            matchingIndex = index
            break
          }
        }
      } else {
        for (let index = currentIndex - 1; index >= 0; index--) {
          const entry = entries?.[index]
          if (
            entry &&
            (entry.state.__TSR_entryId ?? entry.href) === resolvedEntryId
          ) {
            matchingIndex = index
            break
          }
        }
      }

      if (matchingIndex !== undefined) {
        await goToHistoryIndex(router, matchingIndex, nextOptions.ignoreBlocker)
        return
      }

      nextOptions.replace = false
    }
  }

  if (resolvedEntryId !== undefined || native?.minStackState !== undefined) {
    const inputState = nextOptions.state
    nextOptions.state = (previousState: ParsedHistoryState) => {
      const resolvedState =
        inputState === true
          ? previousState
          : inputState
            ? functionalUpdate(inputState, previousState)
            : {}

      return {
        ...resolvedState,
        ...(resolvedEntryId !== undefined
          ? { __TSR_entryId: resolvedEntryId }
          : undefined),
        ...(native?.minStackState !== undefined
          ? { __TSR_nativeMinStackState: native.minStackState }
          : undefined),
      }
    }
  }

  await navigate({
    ...nextOptions,
    href,
    to,
  } as never)
}

/** Navigate backward by stack position or route identity. */
export async function backWithStack(
  router: AnyRouter,
  options: BackOptions<any, any, any> = {},
  navigate: NavigateFn = router.navigate,
): Promise<void> {
  const {
    steps,
    to,
    entryId,
    ifMissing = 'push',
    ignoreBlocker,
    ...targetOptions
  } = options as {
    steps?: number
    to?: string | 'root'
    entryId?: string
    ifMissing?: 'push' | 'replace' | 'noop'
    ignoreBlocker?: boolean
  } & Record<string, unknown>
  const currentIndex = router.history.location.state.__TSR_index

  if (to === 'root') {
    await goToHistoryIndex(router, 0, ignoreBlocker)
    return
  }

  if (to !== undefined) {
    const targetLocation = router.buildLocation({
      ...targetOptions,
      to,
      _includeValidateSearch: true,
    } as never)

    if (targetLocation.href === router.history.location.href) {
      return
    }

    const entries = router.history.getEntries?.()
    for (let index = currentIndex - 1; index >= 0; index--) {
      const candidate = entries?.[index]
      if (
        candidate &&
        (entryId !== undefined
          ? (candidate.state.__TSR_entryId ?? candidate.href) === entryId
          : candidate.pathname === targetLocation.pathname)
      ) {
        await goToHistoryIndex(router, index, ignoreBlocker)
        return
      }
    }

    if (ifMissing !== 'noop') {
      await navigate({
        ...targetOptions,
        to,
        entryId,
        stackBehavior: ifMissing === 'replace' ? 'replace' : 'push',
        ignoreBlocker,
      } as never)
    }
    return
  }

  if (steps !== undefined && (!Number.isFinite(steps) || steps < 1)) {
    throw new RangeError('back steps must be a positive finite number')
  }

  const requestedSteps = Math.floor(steps ?? 1)
  await goToHistoryIndex(
    router,
    Math.max(0, currentIndex - requestedSteps),
    ignoreBlocker,
  )
}
