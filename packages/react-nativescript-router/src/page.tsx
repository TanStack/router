import * as React from 'react'
import { render } from '@nativescript-community/react'
import { useStore } from '@tanstack/react-store'
import { Store } from '@tanstack/store'
import {
  Matches,
  RouteLinkProvider,
  RouterContextProviderBase,
  RouterRendererProvider,
  RouterStateSnapshotProvider,
  createRouterStateSnapshotStore,
  resolveNativeRouteOptions,
  useRouterState,
} from '@tanstack/react-router/native'
import { isNativeScriptHistory } from './history'
import { Link } from './Link'
import { getDefaultNavigationButtonProps } from './action-bar'
import { nativeScriptRouterRenderer } from './fallbacks'
import type {
  AnyRouter,
  WritableRouterStateSnapshotStore,
} from '@tanstack/react-router/native'
import type { EventData, Page } from '@nativescript/core'
import type { NativeScreenSnapshot } from './screen'
import type {
  NativeScriptNavigationTransition,
  NativeScriptRouteContext,
} from './route-options'

export interface NativeScriptActionBarProps {
  router: AnyRouter
  context: NativeScriptRouteContext
}

export interface NativePageRenderOptions {
  actionBar?: (props: NativeScriptActionBarProps) => React.ReactNode | undefined
  defaultActionBar?: boolean
  actionBarBackgroundColor?: string
  actionBarColor?: string
  animated?: boolean
  transition?: NativeScriptNavigationTransition
}

export interface NativePageRecord {
  readonly page: Page
  readonly store: WritableRouterStateSnapshotStore<AnyRouter>
  screen: NativeScreenSnapshot
  setActive: (active: boolean) => void
  update: (screen: NativeScreenSnapshot) => void
  updateOptions: (options: NativePageRenderOptions) => void
  dispose: () => void
}

export const nativePageRecordKey = '__TSR_nativePageRecord'

export type NativePageWithRecord = Page & {
  [nativePageRecordKey]?: NativePageRecord
}

export function getNativePageRecord(
  page: Page | undefined,
): NativePageRecord | undefined {
  return (page as NativePageWithRecord | undefined)?.[nativePageRecordKey]
}

function getDefaultTitle(context: NativeScriptRouteContext): string {
  const staticTitle = context.staticData.title
  if (typeof staticTitle === 'string') {
    return staticTitle
  }

  const metas = context.match.meta
  if (metas) {
    for (let index = metas.length - 1; index >= 0; index--) {
      const title = metas[index]?.title
      if (title) {
        return title
      }
    }
  }

  if (context.pathname === '/') {
    return 'Home'
  }

  const segment = context.pathname.split('/').filter(Boolean).at(-1)
  if (!segment) {
    return ''
  }

  let decodedSegment = segment
  try {
    decodedSegment = decodeURIComponent(segment)
  } catch {
    // Keep malformed URL text renderable on an error or not-found page.
  }

  return decodedSegment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function NativeActionBar({
  router,
  options,
}: {
  router: AnyRouter
  options: NativePageRenderOptions
}) {
  const state = useRouterState()
  const screen = React.useMemo(
    () => resolveNativeRouteOptions(router, state),
    [router, state],
  )

  const resolveBooleanOption = (
    value:
      | boolean
      | ((context: NativeScriptRouteContext) => boolean)
      | undefined,
    fallback: boolean,
  ) =>
    typeof value === 'function' ? value(screen.context) : (value ?? fallback)

  if (!resolveBooleanOption(screen.options.headerShown, true)) {
    return null
  }

  const routeHeader = screen.options.header
  if (typeof routeHeader === 'function') {
    return routeHeader(screen.context)
  }
  if (routeHeader !== undefined) {
    return routeHeader
  }

  const customActionBar = options.actionBar?.({
    router,
    context: screen.context,
  })
  if (customActionBar !== undefined) {
    return customActionBar
  }
  if (options.defaultActionBar === false) {
    return null
  }

  const title =
    typeof screen.options.title === 'function'
      ? screen.options.title(screen.context)
      : (screen.options.title ?? getDefaultTitle(screen.context))
  const canGoBack = screen.context.canGoBack
  const showBackButton =
    canGoBack && resolveBooleanOption(screen.options.headerBackVisible, true)

  return React.createElement(
    'actionbar',
    {
      title,
      iosLargeTitle: screen.options.headerLargeTitle,
      backgroundColor:
        screen.options.headerStyle?.backgroundColor ??
        options.actionBarBackgroundColor,
      color: screen.options.headerStyle?.color ?? options.actionBarColor,
      flat: screen.options.headerStyle?.flat,
    },
    canGoBack
      ? React.createElement(
          'navigationbutton',
          getDefaultNavigationButtonProps(
            router,
            screen.options.headerBackTitle,
            showBackButton,
          ),
        )
      : null,
  )
}

function NativePageTree({
  router,
  store,
  activeStore,
  optionsStore,
}: {
  router: AnyRouter
  store: WritableRouterStateSnapshotStore<AnyRouter>
  activeStore: Store<boolean>
  optionsStore: Store<NativePageRenderOptions>
}) {
  const options = useStore(optionsStore, (value) => value)

  return (
    <RouterRendererProvider renderer={nativeScriptRouterRenderer}>
      <RouteLinkProvider component={Link}>
        <RouterContextProviderBase router={router}>
          <RouterStateSnapshotProvider
            router={router}
            store={store}
            activeStore={activeStore}
          >
            <NativeActionBar router={router} options={options} />
            <Matches includeTransitioner={false} />
          </RouterStateSnapshotProvider>
        </RouterContextProviderBase>
      </RouteLinkProvider>
    </RouterRendererProvider>
  )
}

export function createNativePageRecord({
  router,
  screen,
  options,
  onNavigatedTo,
  onDisposed,
}: {
  router: AnyRouter
  screen: NativeScreenSnapshot
  options: NativePageRenderOptions
  onNavigatedTo: (record: NativePageRecord, isBackNavigation: boolean) => void
  onDisposed: (record: NativePageRecord) => void
}): NativePageRecord {
  const page = document.createElement('Page') as unknown as NativePageWithRecord
  const store = createRouterStateSnapshotStore(screen.state)
  const activeStore = new Store(false)
  const optionsStore = new Store(options)
  const history = router.history
  let disposed = false
  let disposeTree: (() => void) | undefined

  const updateSwipeBack = () => {
    const blocked = isNativeScriptHistory(history) && history.hasBlockers()
    page.enableSwipeBackNavigation =
      !blocked && (record.screen.routeOptions.gestureEnabled ?? true)
  }

  const mountTree = () => {
    if (disposed || disposeTree) {
      return
    }

    disposeTree = render(
      <NativePageTree
        router={router}
        store={store}
        activeStore={activeStore}
        optionsStore={optionsStore}
      />,
      page,
    )
  }

  const unmountTree = () => {
    disposeTree?.()
    disposeTree = undefined
  }

  const record: NativePageRecord = {
    page,
    store,
    screen,
    setActive(active) {
      activeStore.setState(() => active)
    },
    update(nextScreen) {
      record.screen = nextScreen
      updateSwipeBack()
      store.set(nextScreen.state)
    },
    updateOptions(nextOptions) {
      optionsStore.setState(() => nextOptions)
    },
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      unmountTree()
      unsubscribeBlockers?.()
      page.off('loaded', handleLoaded)
      page.off('navigatedTo', handleNavigatedTo)
      page.off('disposeNativeView', handleDisposeNativeView)
      delete page[nativePageRecordKey]
      onDisposed(record)
    },
  }

  const handleLoaded = () => {
    mountTree()
  }
  const handleNavigatedTo = (event: EventData) => {
    const navigationEvent = event as EventData & {
      isBackNavigation?: boolean
    }
    onNavigatedTo(record, navigationEvent.isBackNavigation === true)
  }
  const handleDisposeNativeView = () => {
    unmountTree()
  }
  const unsubscribeBlockers = isNativeScriptHistory(history)
    ? history.subscribeBlockers(updateSwipeBack)
    : undefined

  page[nativePageRecordKey] = record
  page.on('loaded', handleLoaded)
  page.on('navigatedTo', handleNavigatedTo)
  page.on('disposeNativeView', handleDisposeNativeView)
  updateSwipeBack()
  mountTree()

  return record
}
