import type { ScenarioStep } from '../harness'

export type LinkPlacement = 'owner' | 'root'
export const linkCount = 200
export const readyTestId = 'link-owner-ready'
export const navigationTicksPerIteration = 8
export const mountTicksPerIteration = 6
export const benchOptions = {
  warmupIterations: 100,
  warmupTime: 1_000,
  time: 5_000,
  throws: true,
}

export const steps: ReadonlyArray<ScenarioStep> = [
  'go-away',
  'go-home',
  'go-away',
  'go-home',
]

export function assertPage(container: HTMLElement, away: boolean) {
  const owner = away ? 'away' : 'home'
  const marker = container.querySelector(`[data-testid="${readyTestId}"]`)
  if (marker?.textContent !== owner) {
    throw new Error(`Expected owner ${owner}, received ${marker?.textContent}`)
  }
  const links = container.querySelectorAll<HTMLAnchorElement>(
    'a[data-lifecycle-link]',
  )
  if (links.length !== linkCount) {
    throw new Error(`Expected ${linkCount} Links, received ${links.length}`)
  }
  for (const [index, link] of links.entries()) {
    const href = `/items/item-${index}?page=${Number(away) + (index % 5)}`
    if (link.getAttribute('href') !== href) {
      throw new Error(`Link ${index}: expected ${href}, received ${link.href}`)
    }
    if (link.hasAttribute('aria-current')) {
      throw new Error(`Item Link ${index} must be inactive on an owner route`)
    }
  }
  for (const name of ['home', 'away']) {
    const control = container.querySelector(`[data-testid="go-${name}"]`)
    if (
      !control ||
      (control.getAttribute('aria-current') === 'page') !== (name === owner)
    ) {
      throw new Error(`Incorrect active state for persistent ${name} control`)
    }
  }
}

export type ScalingMode = 'unique' | 'repeated' | 'mixed' | 'active'
export type ScalingInput = 'search' | 'hash'
export interface ScalingOptions {
  mode: ScalingMode
  count: number
  input: ScalingInput
}

export const scalingReadyTestId = 'link-scaling-ready'
export const scalingSteps: ReadonlyArray<ScenarioStep> = [
  'scale-second',
  'scale-first',
]

export function scalingKind(mode: ScalingMode, index: number) {
  if (mode !== 'mixed') {
    return mode
  }
  return (['dynamic', 'repeated', 'unique', 'active'] as const)[index % 4]!
}

export function assertScalingPage(
  container: HTMLElement,
  options: ScalingOptions,
  second: boolean,
  mountedAtRoot = false,
) {
  const links = container.querySelectorAll<HTMLAnchorElement>(
    'a[data-scaling-link]',
  )
  if (links.length !== options.count) {
    throw new Error(
      `Expected ${options.count} scaling Links, got ${links.length}`,
    )
  }
  const page = options.input === 'search' && second ? 1 : 0
  const hash = options.input === 'hash' && second ? 'second' : 'first'
  for (const [index, link] of links.entries()) {
    const kind = scalingKind(options.mode, index)
    const href =
      kind === 'repeated'
        ? '/'
        : kind === 'active'
          ? options.mode === 'active'
            ? '/work#first'
            : '/work'
          : kind === 'dynamic'
            ? `/targets/item-${index}?page=${page}#${hash}`
            : `/targets/item-${index}`
    if (link.getAttribute('href') !== href) {
      throw new Error(
        `Scaling Link ${index}: expected ${href}, got ${link.href}`,
      )
    }
    const active = mountedAtRoot
      ? kind === 'repeated'
      : kind === 'active' && (options.mode !== 'active' || !second)
    if ((link.getAttribute('aria-current') === 'page') !== active) {
      throw new Error(`Incorrect active state for scaling Link ${index}`)
    }
  }
  if (!mountedAtRoot) {
    for (const name of ['first', 'second'] as const) {
      const control = container.querySelector(`[data-testid="scale-${name}"]`)
      if (
        !control ||
        (control.getAttribute('aria-current') === 'page') !==
          ((name === 'second') === second)
      ) {
        throw new Error(`Incorrect active scaling control ${name}`)
      }
    }
  }
}

export interface FormatterOptions {
  history: 'memory' | 'opaque' | 'hash'
  externalCount: number
  internalCount: number
}

export const formatterSteps: ReadonlyArray<ScenarioStep> = [
  'format-second',
  'format-first',
]

export function assertFormatterPage(
  container: HTMLElement,
  options: FormatterOptions,
  second: boolean,
) {
  const links = container.querySelectorAll<HTMLAnchorElement>(
    'a[data-formatter-link]',
  )
  const count = options.externalCount + options.internalCount
  if (links.length !== count) {
    throw new Error(`Expected ${count} formatter Links, got ${links.length}`)
  }
  const prefix =
    options.history === 'opaque'
      ? `/formatted/${Number(second)}`
      : options.history === 'hash'
        ? '/shell#'
        : ''
  for (const [index, link] of links.entries()) {
    const href =
      index < options.externalCount
        ? `https://external.example/item-${index}`
        : `${prefix}/targets/item-${index - options.externalCount}`
    if (
      link.getAttribute('href') !== href ||
      link.hasAttribute('aria-current')
    ) {
      throw new Error(`Formatter Link ${index}: expected inactive href ${href}`)
    }
  }
  for (const [index, name] of ['first', 'second'].entries()) {
    const control = container.querySelector(`[data-testid="format-${name}"]`)
    if (
      !control ||
      control.getAttribute('href') !== `${prefix}/format?page=${index}` ||
      (control.getAttribute('aria-current') === 'page') !==
        (Boolean(index) === second)
    ) {
      throw new Error(`Incorrect formatter control ${name}`)
    }
  }
}
