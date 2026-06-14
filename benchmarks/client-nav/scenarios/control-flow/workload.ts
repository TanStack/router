import type { ClientNavWorkload } from '#client-nav/benchmark'
import type { Framework, MountTestApp } from '#client-nav/lifecycle'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'
import {
  START_MARKER,
  createControlFlowActions,
  type ControlFlowAction,
  type ControlFlowMarker,
} from './shared'

function readControlFlowMarker(container: ParentNode) {
  const element = container.querySelector<HTMLElement>(
    '[data-control-flow-branch]',
  )

  if (!element) {
    return undefined
  }

  return {
    branch: element.dataset.controlFlowBranch,
    value: element.dataset.controlFlowValue,
  }
}

function formatControlFlowMarker(marker: ControlFlowMarker) {
  return `${marker.branch}/${marker.value}`
}

function isExpectedControlFlowError(value: unknown) {
  const message =
    value instanceof Error
      ? `${value.name}:${value.message}:${String(value.cause)}`
      : String(value)

  return (
    message.includes('control-flow-loader:') ||
    message.includes('control-flow-search-validation:')
  )
}

function installControlFlowConsoleFilter() {
  const previousConsoleError = console.error

  console.error = (...args: Array<unknown>) => {
    if (args.some(isExpectedControlFlowError)) {
      return
    }

    previousConsoleError(...args)
  }

  return () => {
    console.error = previousConsoleError
  }
}

export function createControlFlowWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp })
  let runIndex = 0

  function assertControlFlowMarker(expected: ControlFlowMarker) {
    const actual = readControlFlowMarker(lifecycle.getContainer())

    if (actual?.branch !== expected.branch || actual.value !== expected.value) {
      throw new Error(
        `Expected control-flow marker ${formatControlFlowMarker(
          expected,
        )}, got ${actual?.branch ?? 'missing'}/${actual?.value ?? 'missing'}`,
      )
    }
  }

  async function waitForControlFlowMarker(expected: ControlFlowMarker) {
    await lifecycle.waitForCounter(
      () => {
        const actual = readControlFlowMarker(lifecycle.getContainer())
        return actual?.branch === expected.branch &&
          actual.value === expected.value
          ? 1
          : 0
      },
      1,
      {
        label: `control-flow marker ${formatControlFlowMarker(expected)}`,
      },
    )

    assertControlFlowMarker(expected)
  }

  async function navigateTo(action: ControlFlowAction) {
    await lifecycle.navigate(
      {
        to: action.to,
        params: action.params,
        search: action.search,
        replace: true,
      },
      {
        label: `control-flow ${action.label}`,
        wait: 'rendered',
      },
    )

    await waitForControlFlowMarker(action.expected)
  }

  async function before() {
    runIndex = 0
    await lifecycle.before()
    lifecycle.addCleanup(installControlFlowConsoleFilter())
    await waitForControlFlowMarker(START_MARKER)
  }

  async function run() {
    const actions = createControlFlowActions(runIndex)
    runIndex += 1

    for (const action of actions) {
      await navigateTo(action)
    }
  }

  async function sanity() {
    await before()

    try {
      await run()
    } finally {
      await lifecycle.after()
    }
  }

  return {
    name: `client control flow loop (${framework})`,
    before,
    run,
    sanity,
    after: lifecycle.after,
  }
}
