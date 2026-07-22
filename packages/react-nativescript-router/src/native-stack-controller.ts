import { createNativePageRecord, getNativePageRecord } from './page'
import { getNativeScriptNavigationOptions } from './navigation-state'
import { resolveNativeScriptTransition } from './route-options'
import { getNativeStackAction } from './screen'
import type { BackstackEntry, NavigationEntry, Page } from '@nativescript/core'
import type { NativePageRecord, NativePageRenderOptions } from './page'
import type { NativeScriptRouterHistory } from './history'
import type { NativeScreenSnapshot } from './screen'
import type { AnyNativeScriptRouter } from './router'

export interface NativeScriptBackstackEntryLike {
  resolvedPage: Page
}

export interface NativeScriptFrameLike {
  currentPage?: Page
  backStack: Array<NativeScriptBackstackEntryLike>
  navigate: (entry: NavigationEntry) => void
  replacePage: (entry: NavigationEntry) => void
  goBack: (entry?: BackstackEntry | NativeScriptBackstackEntryLike) => void
}

export interface NativeStackControllerOptions extends NativePageRenderOptions {
  onNavigationError?: (error: Error) => void
}

export interface NativeStackControllerDependencies {
  createPageRecord?: typeof createNativePageRecord
}

type PendingNativeNavigation = {
  kind: 'initialize' | 'push' | 'replace' | 'pop'
  target: NativePageRecord
  previous?: NativePageRecord
}

export class NativeStackController {
  private current: NativeScreenSnapshot | undefined
  private desired: NativeScreenSnapshot | undefined
  private records = new Map<string, NativePageRecord>()
  private screens = new Map<string, NativeScreenSnapshot>()
  private pending: PendingNativeNavigation | undefined
  private disposed = false
  private options: NativeStackControllerOptions
  private readonly createPageRecord: typeof createNativePageRecord

  constructor(
    private frame: NativeScriptFrameLike,
    private router: AnyNativeScriptRouter,
    options: NativeStackControllerOptions,
    dependencies: NativeStackControllerDependencies = {},
  ) {
    this.options = options
    this.createPageRecord =
      dependencies.createPageRecord ?? createNativePageRecord
  }

  setOptions(options: NativeStackControllerOptions): void {
    this.options = options
    for (const record of this.records.values()) {
      record.updateOptions(options)
    }
  }

  sync(next: NativeScreenSnapshot): void {
    if (this.disposed) {
      return
    }

    this.rememberScreen(next)
    this.desired = next
    this.findRecord(next)?.update(next)
    this.reconcile()
  }

  private reconcile(): void {
    if (this.disposed || this.pending || !this.desired) {
      return
    }

    const next = this.getNextScreen(this.desired)
    const action = getNativeStackAction(this.current, next)

    if (action === 'none') {
      return
    }

    if (action === 'update') {
      const record = this.findRecord(next)
      if (!record) {
        this.fail(
          new Error(
            `NativeScript current page is missing history entry ${next.historyIndex} (${next.href}).`,
          ),
        )
      }
      record.update(next)
      this.current = next
      this.reconcile()
      return
    }

    if (action === 'initialize' || action === 'push') {
      const existing = this.findRecord(next)
      const record = existing ?? this.createRecord(next)
      this.startNavigation(
        { kind: action, target: record },
        () => {
          this.frame.navigate(
            this.getNavigationEntry(record, action === 'push'),
          )
        },
        existing === undefined,
      )
      return
    }

    if (action === 'replace') {
      const previousRecord = this.current
        ? this.findRecord(this.current)
        : undefined
      const existing = this.findRecord(next)
      const record = existing ?? this.createRecord(next)
      this.startNavigation(
        {
          kind: 'replace',
          target: record,
          previous:
            previousRecord && previousRecord !== record
              ? previousRecord
              : undefined,
        },
        () => {
          this.frame.replacePage(this.getNavigationEntry(record, true))
        },
        existing === undefined,
      )
      return
    }

    const target = this.findRecord(next)
    if (!target) {
      this.fail(
        new Error(
          `NativeScript back stack is missing history entry ${next.historyIndex} (${next.href}).`,
        ),
      )
    }

    target.update(next)

    if (this.getVisibleRecord() === target) {
      this.current = next
      this.activate(target)
      this.pruneAbove(next.historyIndex)
      this.reconcile()
      return
    }

    const targetEntry = this.frame.backStack.find(
      (entry) => entry.resolvedPage === target.page,
    )
    if (!targetEntry) {
      this.fail(
        new Error(
          `NativeScript Frame cannot pop to history entry ${next.historyIndex} (${next.href}).`,
        ),
      )
    }

    this.startNavigation({ kind: 'pop', target }, () => {
      this.frame.goBack(targetEntry)
    })
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    for (const record of [...this.records.values()]) {
      record.dispose()
    }
    this.records.clear()
    this.screens.clear()
    this.pending = undefined
    this.desired = undefined
  }

  private startNavigation(
    pending: PendingNativeNavigation,
    navigate: () => void,
    disposeTargetOnError = false,
  ): void {
    this.pending = pending
    try {
      navigate()
    } catch (error) {
      const failedBeforeCommit = this.pending === pending
      if (failedBeforeCommit) {
        this.pending = undefined
      }
      if (disposeTargetOnError && failedBeforeCommit) {
        pending.target.dispose()
      }
      this.fail(
        error instanceof Error
          ? error
          : new Error('NativeScript navigation failed', { cause: error }),
      )
    }
  }

  private createRecord(screen: NativeScreenSnapshot): NativePageRecord {
    const existing = this.findRecord(screen)
    if (existing) {
      existing.update(screen)
      return existing
    }

    const record = this.createPageRecord({
      router: this.router,
      screen,
      options: this.options,
      onNavigatedTo: (visibleRecord, isBackNavigation) => {
        this.handlePageNavigatedTo(visibleRecord, isBackNavigation)
      },
      onDisposed: (disposedRecord) => {
        const key = disposedRecord.screen.locationKey
        if (this.records.get(key) === disposedRecord) {
          this.records.delete(key)
        }
      },
    })
    this.records.set(screen.locationKey, record)
    return record
  }

  private findRecord(
    screen: NativeScreenSnapshot,
  ): NativePageRecord | undefined {
    return this.records.get(screen.locationKey)
  }

  private getVisibleRecord(): NativePageRecord | undefined {
    return getNativePageRecord(this.frame.currentPage)
  }

  private rememberScreen(screen: NativeScreenSnapshot): void {
    const stack = this.getHistoryStack()
    if (stack) {
      const liveKeys = new Set(
        stack.map(
          (entry) => entry.state.__TSR_key ?? entry.state.key ?? entry.href,
        ),
      )
      for (const key of this.screens.keys()) {
        if (!liveKeys.has(key)) {
          this.screens.delete(key)
        }
      }
    }

    this.screens.set(screen.locationKey, screen)
  }

  private getHistoryStack() {
    const history = this.router.history as Partial<NativeScriptRouterHistory>
    return typeof history.getStackSnapshot === 'function'
      ? history.getStackSnapshot()
      : undefined
  }

  private getNextScreen(desired: NativeScreenSnapshot): NativeScreenSnapshot {
    if (
      !this.current ||
      desired.historyIndex <= this.current.historyIndex + 1
    ) {
      return desired
    }

    const stack = this.getHistoryStack()
    if (!stack) {
      return desired
    }

    for (
      let index = this.current.historyIndex + 1;
      index < desired.historyIndex;
      index++
    ) {
      const entry = stack[index]
      const key = entry?.state.__TSR_key ?? entry?.state.key ?? entry?.href
      if (!key) {
        continue
      }
      const screen = this.screens.get(key)
      if (screen) {
        return screen
      }
    }

    return desired
  }

  private getNavigationEntry(
    record: NativePageRecord,
    hasPreviousPage: boolean,
  ): NavigationEntry {
    const routeTransition = resolveNativeScriptTransition(
      record.screen.routeOptions,
    )
    const navigationOptions = getNativeScriptNavigationOptions(
      record.screen.state.location.state,
    )

    return {
      create: () => record.page,
      animated: hasPreviousPage
        ? (navigationOptions?.animated ??
          routeTransition.animated ??
          this.options.animated ??
          true)
        : false,
      transition:
        navigationOptions?.transition ??
        routeTransition.transition ??
        this.options.transition,
      backstackVisible: true,
      clearHistory: false,
    }
  }

  private handlePageNavigatedTo(
    record: NativePageRecord,
    isBackNavigation: boolean,
  ): void {
    if (this.disposed) {
      return
    }

    const pending = this.pending
    if (pending?.target === record) {
      this.pending = undefined
      this.current = record.screen
      this.activate(record)
      if (pending.kind === 'replace') {
        pending.previous?.dispose()
      }
      if (pending.kind === 'pop' || isBackNavigation) {
        this.pruneAbove(record.screen.historyIndex)
      }
      this.reconcile()
      return
    }

    if (!isBackNavigation) {
      return
    }

    const routerIndex = this.router.history.location.state.__TSR_index ?? 0
    const targetIndex = record.screen.historyIndex
    this.current = record.screen
    this.desired = record.screen
    this.activate(record)
    this.rememberScreen(record.screen)
    this.pruneAbove(targetIndex)

    if (targetIndex < routerIndex) {
      this.router.history.go(targetIndex - routerIndex, {
        ignoreBlocker: true,
      })
    }
  }

  private pruneAbove(historyIndex: number): void {
    for (const record of [...this.records.values()]) {
      if (record.screen.historyIndex > historyIndex) {
        record.dispose()
      }
    }
  }

  private activate(activeRecord: NativePageRecord): void {
    for (const record of this.records.values()) {
      record.setActive(record === activeRecord)
    }
  }

  private fail(error: Error): never {
    this.options.onNavigationError?.(error)
    throw error
  }
}
