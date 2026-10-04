/**
 * In-page instrumentation driven by `../run.ts`. The runner calls
 * `prepare(dest)`, performs a real mouse click on the control Link, then
 * `collect()`. Times are relative to the click event reaching a capture
 * listener on `window`, before any framework handler runs.
 */

export type Leaf = 'a' | 'b'

/** Event Timing entry of the measured interaction, trimmed for transport. */
export interface EventEntry {
  name: string
  /** Event `timeStamp` to the next paint, rounded to 8 ms by the browser. */
  duration: number
  /** `processingEnd - processingStart`: listeners of that event. */
  processing: number
  /** `processingStart - startTime`. */
  inputDelay: number
}

export interface ProbeSample {
  dest: Leaf
  /**
   * Click capture to the window's bubble listener, the last one. A trusted
   * event drains microtasks after each listener, so this covers the framework
   * listeners and the microtasks they queue: the click's first yield.
   */
  clickTaskMs: number | null
  /**
   * Click capture to a MessageChannel task posted then. Chromium prioritizes
   * rendering after discrete input, so it runs after the next frame.
   */
  firstTaskMs: number
  /** Click capture to a task queued from the next animation frame (after it paints). */
  frameMs: number
  /** Click capture to the destination leaf replacing the source leaf in the DOM. */
  renderedMs: number
  /** Click `timeStamp` to the click capture listener. */
  clickDelayMs: number
  /** Event Timing entries sharing the click's `interactionId`; empty under 16 ms. */
  entries: Array<EventEntry>
  interactionId: number | null
}

interface Pending {
  dest: Leaf
  clickAt?: number
  clickTimeStamp?: number
  handlersEnd?: number
  yieldAt?: number
  frameAt?: number
  renderedAt?: number
  rendered: Promise<void>
  framed: Promise<void>
  observer: MutationObserver
}

const eventEntries: Array<PerformanceEventTiming> = []
// `durationThreshold` (16 ms minimum) is missing from TypeScript's DOM types.
new PerformanceObserver((list) => {
  eventEntries.push(...(list.getEntries() as Array<PerformanceEventTiming>))
}).observe({
  type: 'event',
  durationThreshold: 16,
  buffered: true,
} as PerformanceObserverInit)

let current: Pending | undefined

function nextTask() {
  return new Promise<number>((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => resolve(performance.now())
    channel.port2.postMessage(undefined)
  })
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

window.addEventListener(
  'click',
  (event) => {
    const pending = current
    if (!pending || pending.clickAt !== undefined) {
      return
    }
    pending.clickAt = performance.now()
    pending.clickTimeStamp = event.timeStamp
    void nextTask().then((at) => {
      pending.yieldAt = at
    })
    requestAnimationFrame(() => {
      void nextTask().then((at) => {
        pending.frameAt = at
      })
    })
  },
  true,
)

window.addEventListener('click', () => {
  if (current && current.handlersEnd === undefined) {
    current.handlersEnd = performance.now()
  }
})

function leafPresent(leaf: Leaf) {
  return document.querySelector(`[data-leaf="${leaf}"]`) !== null
}

async function settle() {
  await new Promise<void>((resolve) =>
    requestIdleCallback(() => resolve(), { timeout: 250 }),
  )
  await nextFrame()
  await nextTask()
}

function findInteraction(clickTimeStamp: number) {
  const click = eventEntries.find(
    (entry) =>
      entry.name === 'click' &&
      Math.abs(entry.startTime - clickTimeStamp) < 0.5,
  )
  if (!click?.interactionId) {
    return undefined
  }
  return eventEntries.filter(
    (entry) => entry.interactionId === click.interactionId,
  )
}

export const probe = {
  /** Centers of the control Links, in CSS pixels. */
  controls() {
    return Object.fromEntries(
      (['a', 'b'] as const).map((leaf) => {
        const rect = document
          .querySelector(`[data-testid="go-${leaf}"]`)!
          .getBoundingClientRect()
        return [
          leaf,
          { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        ]
      }),
    )
  },

  /** Counts of measured Links per owner and of active ones. */
  census() {
    const count = (selector: string) =>
      document.querySelectorAll(selector).length
    return {
      path: location.pathname,
      layout: count('[data-owner="layout"] a[data-perf-link]'),
      leaf: count('[data-owner="leaf"] a[data-perf-link]'),
      active: count('a[data-perf-link][data-status="active"]'),
      leafA: leafPresent('a'),
      leafB: leafPresent('b'),
    }
  },

  async prepare(dest: Leaf) {
    if (current) {
      throw new Error('A sample is already pending')
    }
    const source: Leaf = dest === 'a' ? 'b' : 'a'
    if (!leafPresent(source) || leafPresent(dest)) {
      throw new Error(`Expected to be on /lane/${source}`)
    }
    await settle()
    eventEntries.length = 0
    let resolveRendered!: () => void
    const rendered = new Promise<void>((resolve) => (resolveRendered = resolve))
    const pending: Pending = {
      dest,
      rendered,
      framed: Promise.resolve(),
      observer: new MutationObserver(() => {
        if (
          pending.renderedAt === undefined &&
          leafPresent(dest) &&
          !leafPresent(source)
        ) {
          pending.renderedAt = performance.now()
          resolveRendered()
        }
      }),
    }
    pending.observer.observe(document.body, { childList: true, subtree: true })
    current = pending
  },

  async collect(): Promise<ProbeSample> {
    const pending = current
    if (!pending) {
      throw new Error('No pending sample')
    }
    const timeout = setTimeout(() => {
      console.error(`Destination ${pending.dest} never rendered`)
    }, 10_000)
    await pending.rendered
    clearTimeout(timeout)
    pending.observer.disconnect()
    while (pending.frameAt === undefined || pending.yieldAt === undefined) {
      await nextFrame()
      await nextTask()
    }
    // Event Timing reports after the next paint; entries under the 16 ms
    // threshold never arrive.
    const deadline = performance.now() + 300
    let interaction = findInteraction(pending.clickTimeStamp!)
    while (!interaction && performance.now() < deadline) {
      await nextFrame()
      await nextTask()
      interaction = findInteraction(pending.clickTimeStamp!)
    }
    current = undefined
    const clickAt = pending.clickAt!
    return {
      dest: pending.dest,
      clickTaskMs:
        pending.handlersEnd === undefined
          ? null
          : pending.handlersEnd - clickAt,
      firstTaskMs: pending.yieldAt - clickAt,
      frameMs: pending.frameAt - clickAt,
      renderedMs: pending.renderedAt! - clickAt,
      clickDelayMs: clickAt - pending.clickTimeStamp!,
      interactionId: interaction?.[0]?.interactionId ?? null,
      entries: (interaction ?? []).map((entry) => ({
        name: entry.name,
        duration: entry.duration,
        processing: entry.processingEnd - entry.processingStart,
        inputDelay: entry.processingStart - entry.startTime,
      })),
    }
  },
}

export type Probe = typeof probe

declare global {
  interface Window {
    __linkInp?: Probe
  }
}

window.__linkInp = probe
