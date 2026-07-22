import { describe, expect, test, vi } from 'vitest'

import { createNativeScriptHistory } from '../src/history'
import { createNativeScriptNavigationState } from '../src/navigation-state'
import { NativeStackController } from '../src/native-stack-controller'
import { nativePageRecordKey } from '../src/page'
import type { AnyNativeScriptRouter } from '../src/router'
import type {
  NativeScriptBackstackEntryLike,
  NativeScriptFrameLike,
} from '../src/native-stack-controller'
import type {
  NativePageRecord,
  NativePageWithRecord,
  createNativePageRecord,
} from '../src/page'
import type { NativeScreenSnapshot } from '../src/screen'
import type { BackstackEntry, NavigationEntry, Page } from '@nativescript/core'

vi.mock('../src/page', () => ({
  createNativePageRecord: vi.fn(() => {
    throw new Error('Test must inject a page-record factory')
  }),
  getNativePageRecord: (page: Record<string, unknown> | undefined) =>
    page?.__TSR_nativePageRecord,
  nativePageRecordKey: '__TSR_nativePageRecord',
}))

type CreatePageRecordArgs = Parameters<typeof createNativePageRecord>[0]

class TestFrame implements NativeScriptFrameLike {
  currentPage?: Page
  backStack: Array<NativeScriptBackstackEntryLike> = []
  navigateCalls: Array<NavigationEntry> = []
  replacePageCalls: Array<NavigationEntry> = []
  goBackCalls: Array<
    BackstackEntry | NativeScriptBackstackEntryLike | undefined
  > = []

  navigate(entry: NavigationEntry) {
    this.navigateCalls.push(entry)
    if (this.currentPage) {
      this.backStack.push({ resolvedPage: this.currentPage })
    }
    this.currentPage = entry.create!() as Page
  }

  replacePage(entry: NavigationEntry) {
    this.replacePageCalls.push(entry)
    this.currentPage = entry.create!() as Page
  }

  goBack(entry?: BackstackEntry | NativeScriptBackstackEntryLike) {
    this.goBackCalls.push(entry)
    const targetIndex = entry
      ? this.backStack.findIndex(
          (backstackEntry) =>
            backstackEntry.resolvedPage === entry.resolvedPage,
        )
      : this.backStack.length - 1
    if (targetIndex < 0) {
      return
    }
    this.currentPage = this.backStack[targetIndex]!.resolvedPage
    this.backStack = this.backStack.slice(0, targetIndex)
  }
}

function createHarness(initialEntries: Array<string> = ['/']) {
  const history = createNativeScriptHistory({ initialEntries })
  const router = { history } as AnyNativeScriptRouter
  const frame = new TestFrame()
  const callbacks = new Map<Page, Pick<CreatePageRecordArgs, 'onNavigatedTo'>>()
  const records = new Map<string, NativePageRecord>()
  const disposedKeys: Array<string> = []

  const createPageRecord = vi.fn((args: CreatePageRecordArgs) => {
    const page = {} as NativePageWithRecord
    let disposed = false
    const record: NativePageRecord = {
      page,
      store: {} as NativePageRecord['store'],
      screen: args.screen,
      setActive: vi.fn(),
      update(next) {
        record.screen = next
      },
      updateOptions: vi.fn(),
      dispose() {
        if (disposed) {
          return
        }
        disposed = true
        disposedKeys.push(record.screen.locationKey)
        args.onDisposed(record)
      },
    }
    page[nativePageRecordKey] = record
    callbacks.set(page, { onNavigatedTo: args.onNavigatedTo })
    records.set(args.screen.locationKey, record)
    return record
  }) as typeof createNativePageRecord

  const controller = new NativeStackController(
    frame,
    router,
    {},
    {
      createPageRecord,
    },
  )
  let revision = 0

  const snapshot = (
    routeOptions: NativeScreenSnapshot['routeOptions'] = {},
  ): NativeScreenSnapshot => {
    revision += 1
    const location = history.location
    return {
      historyIndex: location.state.__TSR_index,
      locationKey: location.state.__TSR_key!,
      href: location.href,
      revision,
      state: {
        location,
        loadedAt: revision,
      } as NativeScreenSnapshot['state'],
      routeContext: {
        pathname: location.pathname,
        href: location.href,
        canGoBack: history.canGoBack(),
      } as NativeScreenSnapshot['routeContext'],
      routeOptions,
    }
  }

  const finishNavigation = (isBackNavigation = false) => {
    const page = frame.currentPage as NativePageWithRecord | undefined
    if (!page) {
      throw new Error('No current page')
    }
    const callback = callbacks.get(page)
    if (!callback) {
      throw new Error('No page callback registered')
    }
    const record = page[nativePageRecordKey]
    if (!record) {
      throw new Error('No page record registered')
    }
    callback.onNavigatedTo(record, isBackNavigation)
  }

  return {
    callbacks,
    controller,
    createPageRecord,
    disposedKeys,
    finishNavigation,
    frame,
    history,
    records,
    snapshot,
  }
}

describe('NativeStackController', () => {
  test('initializes without animation and pushes search-only entries', () => {
    const harness = createHarness()
    harness.controller.sync(harness.snapshot())

    expect(harness.frame.navigateCalls[0]).toMatchObject({
      animated: false,
      backstackVisible: true,
      clearHistory: false,
    })
    harness.finishNavigation()

    harness.history.push('/?query=native')
    harness.controller.sync(harness.snapshot())

    expect(harness.frame.navigateCalls).toHaveLength(2)
    expect(harness.frame.navigateCalls[1]).toMatchObject({ animated: true })
    expect(harness.frame.backStack).toHaveLength(1)
  })

  test('uses Frame.replacePage and disposes the replaced tree after commit', () => {
    const harness = createHarness()
    const initial = harness.snapshot()
    harness.controller.sync(initial)
    harness.finishNavigation()

    harness.history.replace('/replacement')
    const replacement = harness.snapshot()
    harness.controller.sync(replacement)

    expect(harness.frame.replacePageCalls).toHaveLength(1)
    expect(harness.disposedKeys).toEqual([])

    harness.finishNavigation()
    expect(harness.disposedKeys).toEqual([initial.locationKey])
  })

  test('pops to the exact native entry for Router-originated back', () => {
    const harness = createHarness()
    const root = harness.snapshot()
    harness.controller.sync(root)
    harness.finishNavigation()
    harness.history.push('/one')
    harness.controller.sync(harness.snapshot())
    harness.finishNavigation()
    harness.history.push('/two')
    harness.controller.sync(harness.snapshot())
    harness.finishNavigation()

    const go = vi.spyOn(harness.history, 'go')
    harness.history.go(-2)
    go.mockClear()
    harness.controller.sync(root)

    expect(harness.frame.goBackCalls).toHaveLength(1)
    expect(harness.frame.currentPage).toBe(
      harness.records.get(root.locationKey)!.page,
    )

    harness.finishNavigation(true)
    expect(go).not.toHaveBeenCalled()
  })

  test('synchronizes a completed native swipe once and prunes popped pages', () => {
    const harness = createHarness()
    harness.controller.sync(harness.snapshot())
    harness.finishNavigation()
    harness.history.push('/one')
    const one = harness.snapshot()
    harness.controller.sync(one)
    harness.finishNavigation()
    harness.history.push('/two')
    const two = harness.snapshot()
    harness.controller.sync(two)
    harness.finishNavigation()

    const targetEntry = harness.frame.backStack.find(
      (entry) =>
        entry.resolvedPage === harness.records.get(one.locationKey)!.page,
    )!
    const go = vi.spyOn(harness.history, 'go')
    harness.frame.goBack(targetEntry)
    harness.finishNavigation(true)

    expect(go).toHaveBeenCalledOnce()
    expect(go).toHaveBeenCalledWith(-1, { ignoreBlocker: true })
    expect(harness.history.location.pathname).toBe('/one')
    expect(harness.disposedKeys).toContain(two.locationKey)
  })

  test('fails instead of replacing when native and Router stacks diverge', () => {
    const harness = createHarness(['/', '/one', '/two'])
    harness.controller.sync(harness.snapshot())
    harness.finishNavigation()
    const onNavigationError = vi.fn()
    harness.controller.setOptions({ onNavigationError })

    harness.history.back()
    expect(() => harness.controller.sync(harness.snapshot())).toThrow(
      'NativeScript back stack is missing history entry',
    )
    expect(onNavigationError).toHaveBeenCalledOnce()
    expect(harness.frame.replacePageCalls).toEqual([])
  })

  test('prefers navigation-state transitions over route and provider defaults', () => {
    const harness = createHarness()
    harness.controller.setOptions({
      animated: false,
      transition: { name: 'slideRight' },
    })
    harness.controller.sync(harness.snapshot())
    harness.finishNavigation()

    harness.history.push(
      '/one',
      createNativeScriptNavigationState({
        animated: true,
        transition: { name: 'flipLeft' },
      }),
    )
    harness.controller.sync(
      harness.snapshot({ animation: 'fade', animated: false }),
    )

    expect(harness.frame.navigateCalls[1]).toMatchObject({
      animated: true,
      transition: { name: 'flipLeft' },
    })
  })

  test('updates render options without recreating native pages', () => {
    const harness = createHarness()
    const initial = harness.snapshot()
    harness.controller.sync(initial)
    const record = harness.records.get(initial.locationKey)!

    harness.controller.setOptions({ actionBarColor: 'red' })

    expect(record.updateOptions).toHaveBeenCalledWith({
      actionBarColor: 'red',
    })
    expect(harness.createPageRecord).toHaveBeenCalledOnce()
  })

  test('activates blockers only for the committed visible Page', () => {
    const harness = createHarness()
    const root = harness.snapshot()
    harness.controller.sync(root)
    const rootRecord = harness.records.get(root.locationKey)!

    expect(rootRecord.setActive).not.toHaveBeenCalled()
    harness.finishNavigation()
    expect(rootRecord.setActive).toHaveBeenLastCalledWith(true)

    harness.history.push('/one')
    const one = harness.snapshot()
    harness.controller.sync(one)
    const oneRecord = harness.records.get(one.locationKey)!

    expect(rootRecord.setActive).toHaveBeenLastCalledWith(true)
    expect(oneRecord.setActive).not.toHaveBeenCalled()

    harness.finishNavigation()
    expect(rootRecord.setActive).toHaveBeenLastCalledWith(false)
    expect(oneRecord.setActive).toHaveBeenLastCalledWith(true)
  })

  test('waits for the initial Page before calling Frame.replacePage', () => {
    const harness = createHarness()
    const initial = harness.snapshot()
    harness.controller.sync(initial)

    harness.history.replace('/replacement')
    const replacement = harness.snapshot()
    harness.controller.sync(replacement)

    expect(harness.frame.replacePageCalls).toEqual([])

    harness.finishNavigation()
    expect(harness.frame.replacePageCalls).toHaveLength(1)
    expect(harness.disposedKeys).toEqual([])

    harness.finishNavigation()
    expect(harness.disposedKeys).toEqual([initial.locationKey])
  })

  test('keeps resolved intermediate Pages during rapid pushes', () => {
    const harness = createHarness()
    harness.controller.sync(harness.snapshot())
    harness.finishNavigation()

    harness.history.push('/one')
    harness.controller.sync(harness.snapshot())
    harness.history.push('/two')
    const two = harness.snapshot()
    harness.controller.sync(two)
    harness.history.push('/three')
    const three = harness.snapshot()
    harness.controller.sync(three)

    expect(harness.frame.navigateCalls).toHaveLength(2)

    harness.finishNavigation()
    expect(harness.frame.navigateCalls).toHaveLength(3)
    expect(harness.frame.currentPage).toBe(
      harness.records.get(two.locationKey)!.page,
    )

    harness.finishNavigation()
    expect(harness.frame.navigateCalls).toHaveLength(4)
    expect(harness.frame.currentPage).toBe(
      harness.records.get(three.locationKey)!.page,
    )

    harness.finishNavigation()
    expect(harness.frame.backStack).toHaveLength(3)
  })

  test('finishes an in-flight push before reconciling a Router back', () => {
    const harness = createHarness()
    const root = harness.snapshot()
    harness.controller.sync(root)
    harness.finishNavigation()

    harness.history.push('/one')
    const one = harness.snapshot()
    harness.controller.sync(one)
    harness.history.back()
    harness.controller.sync(root)

    expect(harness.frame.goBackCalls).toEqual([])

    harness.finishNavigation()
    expect(harness.frame.goBackCalls).toHaveLength(1)
    expect(harness.frame.currentPage).toBe(
      harness.records.get(root.locationKey)!.page,
    )

    harness.finishNavigation(true)
    expect(harness.disposedKeys).toContain(one.locationKey)
    expect(harness.history.location.pathname).toBe('/')
  })
})
