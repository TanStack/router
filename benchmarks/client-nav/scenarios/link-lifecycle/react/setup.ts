import { createHashHistory } from '@tanstack/history'
import { JSDOM } from 'jsdom'
import { createMountLoopSetup, createScenarioSetup } from '../../harness'
import {
  assertFormatterPage,
  assertPage,
  assertScalingPage,
  formatterSteps,
  readyTestId,
  scalingReadyTestId,
  scalingSteps,
  steps,
} from '../shared'
import type { FormatterOptions, LinkPlacement, ScalingOptions } from '../shared'
import type { RouterHistory } from '@tanstack/history'
import type * as App from './src/main'

const appModulePath = './dist/app.js'
const app: typeof App = await import(/* @vite-ignore */ appModulePath)
if (app.serverEnvironment !== false) {
  throw new Error(
    'Link lifecycle benchmarks require the production client build',
  )
}

export function setupNavigation(placement: LinkPlacement) {
  let previousLink: Element | null = null
  let homeControl: Element | null = null
  return createScenarioSetup({
    frameworkLabel: 'React',
    mount: (container, history) => {
      previousLink = null
      homeControl = null
      return app.mountTestApp(container, history, placement)
    },
    steps,
    assertAfterStep: (index, container, history) => {
      assertPage(container, index % 2 === 0)
      if (history.length !== 1) {
        throw new Error('Link lifecycle navigation must keep history bounded')
      }
      const link = container.querySelector('a[data-lifecycle-link]')
      if (previousLink && (previousLink === link) !== (placement === 'root')) {
        throw new Error(`Incorrect Link lifetime for ${placement} placement`)
      }
      previousLink = link
      const control = container.querySelector('[data-testid="go-home"]')
      if (homeControl && control !== homeControl) {
        throw new Error('Navigation control Links must remain mounted')
      }
      homeControl = control
    },
  })
}

export function setupMount() {
  return createMountLoopSetup({
    frameworkLabel: 'React',
    mount: app.mountTestApp,
    readyTestId,
    assertReady: (container) => assertPage(container, false),
  })
}

export function setupScalingNavigation(options: ScalingOptions) {
  let originalLinks: Array<Element> | undefined
  return createScenarioSetup({
    frameworkLabel: 'React',
    initialUrl: '/work?page=0#first',
    mount: (container, history) => {
      originalLinks = undefined
      return app.mountScalingApp(container, history, options)
    },
    steps: scalingSteps,
    assertAfterStep: (index, container, history) => {
      assertScalingPage(container, options, index % 2 === 0)
      if (history.length !== 1) {
        throw new Error('Scaling navigation must keep history bounded')
      }
      const links = Array.from(
        container.querySelectorAll('a[data-scaling-link]'),
      )
      const previousLinks = originalLinks
      if (previousLinks && links.some((link, i) => link !== previousLinks[i])) {
        throw new Error('Scaling navigation must preserve every mounted Link')
      }
      originalLinks = links
    },
  })
}

export function setupScalingMount() {
  const options: ScalingOptions = {
    mode: 'unique',
    count: 1000,
    input: 'search',
  }
  let assertOutput = false
  const test = createMountLoopSetup({
    frameworkLabel: 'React',
    mount: (container, history) =>
      app.mountScalingApp(container, history, options),
    readyTestId: scalingReadyTestId,
    assertReady: (container) => {
      if (assertOutput) {
        assertScalingPage(container, options, false, true)
      }
    },
  })
  return {
    ...test,
    before: async () => {
      // Validate the full grid once outside timing; timed mounts only wait for commit.
      assertOutput = true
      try {
        await test.tick()
      } finally {
        assertOutput = false
      }
    },
  }
}

export function setupFormatterNavigation(options: FormatterOptions) {
  let measuredHistory: RouterHistory
  let previousLinks: Array<Element> | undefined
  return createScenarioSetup({
    frameworkLabel: 'React',
    initialUrl: '/format?page=0',
    mount: (container, memoryHistory) => {
      previousLinks = undefined
      const dom =
        options.history === 'hash'
          ? new JSDOM('<!doctype html><html><body></body></html>', {
              url: 'http://localhost/shell#/format?page=0',
            })
          : undefined
      measuredHistory = dom
        ? createHashHistory({ window: dom.window })
        : memoryHistory
      if (options.history === 'opaque') {
        // Public custom formatter: an unrelated source search changes every
        // internal displayed href, while direct external Links bypass it.
        measuredHistory.createHref = (href: string) =>
          `/formatted/${measuredHistory.location.search === '?page=1' ? 1 : 0}${href}`
      }
      const mounted = app.mountFormatterApp(container, measuredHistory, options)
      return {
        ...mounted,
        unmount: () => {
          mounted.unmount()
          if (dom) {
            measuredHistory.destroy()
            dom.window.close()
          }
        },
      }
    },
    steps: formatterSteps,
    assertAfterStep: (index, container) => {
      const second = index % 2 === 0
      assertFormatterPage(container, options, second)
      if (
        measuredHistory.length !== 1 ||
        measuredHistory.location.href !== `/format?page=${Number(second)}`
      ) {
        throw new Error(
          'Formatter navigation must update one bounded history entry',
        )
      }
      const links = Array.from(
        container.querySelectorAll('a[data-formatter-link]'),
      )
      const previous = previousLinks
      if (previous && links.some((link, i) => link !== previous[i])) {
        throw new Error('Formatter navigation must preserve mounted Links')
      }
      previousLinks = links
    },
  })
}

export function setupIsolatedFanout(options: ScalingOptions) {
  let previousLinks: Array<Element> | undefined
  return createScenarioSetup({
    frameworkLabel: 'React',
    initialUrl: '/work?page=0#first',
    mount: (container, history) => {
      previousLinks = undefined
      return app.mountIsolatedFanoutApp(container, history, options)
    },
    steps: scalingSteps,
    assertAfterStep: (index, container, history) => {
      assertScalingPage(container, options, index % 2 === 0)
      if (history.length !== 1) {
        throw new Error('Isolated fanout must keep history bounded')
      }
      if (
        container.querySelector('[data-testid="isolated-grid-renders"]')
          ?.textContent !== '1'
      ) {
        throw new Error(
          'Isolated grid must render once across source publications',
        )
      }
      const links = Array.from(
        container.querySelectorAll('a[data-scaling-link]'),
      )
      const previous = previousLinks
      if (previous && links.some((link, i) => link !== previous[i])) {
        throw new Error('Isolated fanout must preserve every mounted Link')
      }
      previousLinks = links
    },
  })
}
