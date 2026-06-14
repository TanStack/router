import type { NavigateOptions } from '@tanstack/router-core'
import type { ClientNavWorkload } from '#client-nav/benchmark'
import type { Framework, MountTestApp } from '#client-nav/lifecycle'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'
import { installScrollRestorationShims } from './scroll-shim'
import {
  SCROLL_CONTAINER_ID_LIST,
  SCROLL_CONTAINER_IDS,
  SCROLL_START_PATH,
  scrollCycles,
  type ScrollContainerId,
  type ScrollPage,
  type ScrollPosition,
  type ScrollPositions,
} from './shared'
import type { ScrollShimController } from './scroll-shim'

function formatPosition(position: ScrollPosition) {
  return `${position.scrollLeft},${position.scrollTop}`
}

function assertPosition(
  label: string,
  actual: ScrollPosition,
  expected: ScrollPosition,
) {
  if (
    actual.scrollLeft !== expected.scrollLeft ||
    actual.scrollTop !== expected.scrollTop
  ) {
    throw new Error(
      `${label}: expected ${formatPosition(expected)}, got ${formatPosition(actual)}`,
    )
  }
}

function assertPage(container: ParentNode, page: ScrollPage) {
  if (!container.querySelector(`[data-scroll-page="${page}"]`)) {
    throw new Error(`Expected scroll page marker ${page}`)
  }
}

export function createScrollRestorationWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp })
  let scrollShim: ScrollShimController | undefined = undefined

  const getShim = () => {
    if (!scrollShim) {
      throw new Error('Scroll restoration shims are not installed')
    }

    return scrollShim
  }

  const hasPage = (page: ScrollPage) =>
    lifecycle.getContainer().querySelector(`[data-scroll-page="${page}"]`)
      ? 1
      : 0

  async function waitForPage(page: ScrollPage) {
    await lifecycle.waitForCounter(() => hasPage(page), 1, {
      label: `${page} page marker`,
    })
    assertPage(lifecycle.getContainer(), page)
  }

  function getScrollElement(id: ScrollContainerId) {
    const element = lifecycle
      .getContainer()
      .querySelector<HTMLElement>(`[data-scroll-restoration-id="${id}"]`)

    if (!element) {
      throw new Error(`Missing scroll restoration element ${id}`)
    }

    return element
  }

  function applyScrollPositions(positions: ScrollPositions) {
    const shim = getShim()

    if (positions.window) {
      shim.setWindowPosition(positions.window)
      shim.dispatchWindowScroll()
    }

    for (const id of SCROLL_CONTAINER_ID_LIST) {
      const position = positions[id]

      if (!position) {
        continue
      }

      const element = lifecycle
        .getContainer()
        .querySelector<HTMLElement>(`[data-scroll-restoration-id="${id}"]`)

      if (!element) {
        continue
      }

      shim.setElementPosition(element, position)
      shim.dispatchElementScroll(element)
    }
  }

  function assertElementPosition(
    id: ScrollContainerId,
    expected: ScrollPosition,
  ) {
    const shim = getShim()
    const element = getScrollElement(id)

    assertPosition(id, shim.readElementPosition(element), expected)
  }

  function assertWindowPosition(label: string, expected: ScrollPosition) {
    assertPosition(label, getShim().getWindowPosition(), expected)
  }

  async function navigateAndWait(
    options: NavigateOptions,
    page: ScrollPage,
    label: string,
  ) {
    await lifecycle.navigate(options, {
      label,
      wait: 'rendered',
    })
    await waitForPage(page)
  }

  async function goHistory(delta: number, page: ScrollPage, label: string) {
    await lifecycle.waitForRender(
      () => {
        lifecycle.getRouter().history.go(delta)
      },
      { label },
    )
    await waitForPage(page)
  }

  async function resetToStart() {
    await navigateAndWait(
      {
        to: SCROLL_START_PATH,
        replace: true,
      },
      'scroll',
      'reset to scroll start',
    )

    const historyIndex = Number(
      lifecycle.getRouter().history.location.state.__TSR_index ?? 0,
    )

    if (historyIndex > 0) {
      lifecycle.getRouter().history.go(-historyIndex)
      await lifecycle.waitForRouterIdle({ label: 'reset scroll history index' })
    }
  }

  async function runCycle(
    input: (typeof scrollCycles)[number],
    assertScrollEffects: boolean,
  ) {
    await navigateAndWait(
      {
        to: '/scroll/list/$listId',
        params: { listId: input.listId },
      },
      'list',
      `list ${input.listId}`,
    )
    applyScrollPositions(input.listPositions)

    await navigateAndWait(
      {
        to: '/scroll/list/$listId/detail/$itemId',
        params: { listId: input.listId, itemId: input.detailAId },
      },
      'detail',
      `detail ${input.detailAId}`,
    )
    applyScrollPositions(input.detailPositions)

    await goHistory(-1, 'list', `history restore list ${input.listId}`)

    if (assertScrollEffects) {
      assertElementPosition(
        SCROLL_CONTAINER_IDS.list,
        input.listPositions[SCROLL_CONTAINER_IDS.list]!,
      )
    }

    const scrollIntoViewCount = getShim().getScrollIntoViewCalls().length

    await navigateAndWait(
      {
        to: '/scroll/list/$listId/detail/$itemId',
        params: { listId: input.listId, itemId: input.detailAId },
        hash: input.hashId,
        hashScrollIntoView: { block: 'center', inline: 'nearest' },
      },
      'detail',
      `detail hash ${input.detailAId}`,
    )

    const hashCalls = getShim()
      .getScrollIntoViewCalls()
      .slice(scrollIntoViewCount)

    if (
      assertScrollEffects &&
      !hashCalls.some((call) => call.target === input.hashId)
    ) {
      throw new Error(`Expected hash scrollIntoView for ${input.hashId}`)
    }

    applyScrollPositions(input.detailHashPositions)

    await navigateAndWait(
      {
        to: '/scroll/list/$listId/detail/$itemId',
        params: { listId: input.listId, itemId: input.detailBId },
        resetScroll: false,
      },
      'detail',
      `detail no reset ${input.detailBId}`,
    )

    if (assertScrollEffects) {
      assertWindowPosition(
        'resetScroll false window position',
        input.detailHashPositions.window!,
      )
    }

    applyScrollPositions(input.detailBPositions)

    await navigateAndWait(
      {
        to: '/scroll/static',
      },
      'static',
      'static reset',
    )

    if (assertScrollEffects) {
      assertWindowPosition('default reset window position', {
        scrollLeft: 0,
        scrollTop: 0,
      })
      assertElementPosition(SCROLL_CONTAINER_IDS.resetPanel, {
        scrollLeft: 0,
        scrollTop: 0,
      })
    }

    await goHistory(
      -3,
      'list',
      `history restore list from static ${input.listId}`,
    )

    if (assertScrollEffects) {
      assertElementPosition(
        SCROLL_CONTAINER_IDS.list,
        input.listPositions[SCROLL_CONTAINER_IDS.list]!,
      )
    }

    await resetToStart()
  }

  async function before() {
    await after()

    const shim = installScrollRestorationShims()
    scrollShim = shim

    try {
      await lifecycle.before()
      await waitForPage('scroll')
      getScrollElement(SCROLL_CONTAINER_IDS.root)
      getScrollElement(SCROLL_CONTAINER_IDS.resetPanel)
      getScrollElement(SCROLL_CONTAINER_IDS.sidebar)
    } catch (error) {
      scrollShim = undefined
      shim.restore()
      throw error
    }
  }

  async function run() {
    for (const cycle of scrollCycles) {
      await runCycle(cycle, false)
    }
  }

  async function sanity() {
    await before()

    try {
      if (lifecycle.getRouter().options.scrollRestoration !== true) {
        throw new Error('Expected router scrollRestoration to be enabled')
      }

      for (const cycle of scrollCycles) {
        await runCycle(cycle, true)
      }
    } finally {
      await after()
    }
  }

  async function after() {
    const shim = scrollShim
    scrollShim = undefined

    try {
      await lifecycle.after()
    } finally {
      shim?.restore()
    }
  }

  return {
    name: `client scroll restoration loop (${framework})`,
    before,
    run,
    sanity,
    after,
  }
}
