import { Show, createSignal, onMount, type JSX } from 'solid-js'
import { createFileRoute } from '@tanstack/solid-router'
import { Hydrate } from '@tanstack/solid-start'
import {
  idle,
  interaction,
  media,
  visible,
} from '@tanstack/solid-start/hydration'
import { EnhancedNestedWidget } from '../shared/EnhancedNestedWidget'
import type { HydrateOptions } from '@tanstack/solid-start'

type DynamicHydrationMode = 'interaction' | 'visible'

type EnhancedSearch = {
  dynamic?: DynamicHydrationMode
}

export const Route = createFileRoute('/enhanced')({
  validateSearch: (search: Record<string, unknown>): EnhancedSearch => ({
    dynamic:
      search.dynamic === 'visible' || search.dynamic === 'interaction'
        ? search.dynamic
        : undefined,
  }),
  component: EnhancedHydrationPage,
})

type DeferredGate = {
  promise: Promise<void>
  resolve: () => void
}

function createDeferredGate(): DeferredGate {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

const belowFoldProps = {
  when: () => visible({ rootMargin: '0px' }),
} satisfies HydrateOptions

function InteractiveBox(props: { id: string; label: string }): JSX.Element {
  const [count, setCount] = createSignal(0)
  const [hydrated, setHydrated] = createSignal(false)

  onMount(() => {
    setHydrated(true)
  })

  return (
    <button
      data-testid={`${props.id}-button`}
      data-hydrated={hydrated() ? 'true' : 'false'}
      onClick={() => setCount((prev) => prev + 1)}
    >
      {props.label}: <span data-testid={`${props.id}-count`}>{count()}</span>
    </button>
  )
}

function dynamicFromSearch(mode: DynamicHydrationMode | undefined) {
  return mode === 'visible'
    ? visible({ rootMargin: '0px' })
    : interaction({ events: 'click' })
}

function EnhancedHydrationPage() {
  const search = Route.useSearch()
  const searchDrivenHydration = () => dynamicFromSearch(search().dynamic)
  const [rerenders, setRerenders] = createSignal(0)
  const splitGate = createDeferredGate()
  const fireGate = createDeferredGate()
  const runtimeGate = createDeferredGate()
  const [splitWaitReason, setSplitWaitReason] = createSignal('idle')
  const [splitPreload, setSplitPreload] = createSignal('idle')
  const [splitQuery, setSplitQuery] = createSignal('idle')
  const [fireStatus, setFireStatus] = createSignal('idle')
  const [fireWaitReason, setFireWaitReason] = createSignal('idle')
  const [firePreload, setFirePreload] = createSignal('idle')
  const [fireQuery, setFireQuery] = createSignal('idle')
  const [hydrateFirstReason, setHydrateFirstReason] = createSignal('idle')
  const [runtimeWaitReason, setRuntimeWaitReason] = createSignal('idle')
  const [runtimeStatus, setRuntimeStatus] = createSignal('idle')
  const [waitAbortReason, setWaitAbortReason] = createSignal('idle')
  const [abortStatus, setAbortStatus] = createSignal('idle')
  const [showWaitAbortBoundary, setShowWaitAbortBoundary] = createSignal(true)
  const [showAbortBoundary, setShowAbortBoundary] = createSignal(true)

  return (
    <section>
      <h1 data-testid="enhanced-heading">Enhanced Hydrate APIs</h1>
      <p data-testid="enhanced-rerenders">{rerenders()}</p>
      <button
        data-testid="enhanced-rerender"
        onClick={() => setRerenders((count) => count + 1)}
      >
        rerender parent
      </button>

      <p class="dh-note">
        Dynamic visible uses reusable <code>HydrateOptions</code> spread props.
      </p>
      <div class="dh-spacer">Scroll to dynamic visible</div>
      <Hydrate {...belowFoldProps}>
        <InteractiveBox id="enhanced-dynamic-visible" label="dynamic visible" />
      </Hydrate>

      <p class="dh-note">
        This callback reads typed TanStack Router search state, so it must not
        run during server rendering.
      </p>
      <div class="dh-spacer">Scroll to conditional dynamic boundary</div>
      <Hydrate when={searchDrivenHydration}>
        <InteractiveBox
          id="enhanced-dynamic-conditional"
          label="conditional dynamic"
        />
      </Hydrate>

      <p class="dh-note">
        Dynamic interaction stays unhydrated across parent rerenders and
        hydrates on click.
      </p>
      <Hydrate when={() => interaction({ events: 'click' })}>
        <InteractiveBox
          id="enhanced-dynamic-interaction"
          label="dynamic interaction"
        />
      </Hydrate>

      <p data-testid="enhanced-split-wait-reason">{splitWaitReason()}</p>
      <p data-testid="enhanced-split-preload">{splitPreload()}</p>
      <p data-testid="enhanced-split-query">{splitQuery()}</p>
      <button
        data-testid="enhanced-release-split-prefetch"
        onClick={() => splitGate.resolve()}
      >
        release split prefetch
      </button>
      <Hydrate
        when={interaction({ events: 'click' })}
        prefetch={async ({ waitFor, preload, signal, element }) => {
          setSplitQuery(element ? 'element' : 'missing-element')
          const waitForReason = waitFor(interaction({ events: 'pointerover' }))
          setSplitWaitReason('waiting')
          const reason = await waitForReason
          setSplitWaitReason(reason)
          if (reason === 'abort' || signal.aborted) return

          await Promise.all([
            preload().then(() => setSplitPreload('done')),
            splitGate.promise.then(() => setSplitQuery('done')),
          ])
        }}
      >
        <InteractiveBox
          id="enhanced-procedural-split"
          label="procedural split enhanced-procedural-split-child"
        />
      </Hydrate>

      <p data-testid="enhanced-fire-status">{fireStatus()}</p>
      <p data-testid="enhanced-fire-wait-reason">{fireWaitReason()}</p>
      <p data-testid="enhanced-fire-preload">{firePreload()}</p>
      <p data-testid="enhanced-fire-query">{fireQuery()}</p>
      <button
        data-testid="enhanced-release-fire-prefetch"
        onClick={() => fireGate.resolve()}
      >
        release fire-and-forget prefetch
      </button>
      <Hydrate
        when={interaction({ events: 'click' })}
        prefetch={({ waitFor, preload }) => {
          const waitForReason = waitFor(interaction({ events: 'pointerover' }))
          setFireWaitReason('waiting')
          void waitForReason.then((reason) => {
            setFireWaitReason(reason)
            if (reason === 'abort') return

            setFireStatus('started')
            void preload().then(() => setFirePreload('done'))
            void fireGate.promise.then(() => setFireQuery('done'))
          })
        }}
      >
        <InteractiveBox
          id="enhanced-fire-and-forget"
          label="fire and forget enhanced-fire-and-forget-child"
        />
      </Hydrate>

      <p data-testid="enhanced-hydrate-first-reason">{hydrateFirstReason()}</p>
      <Hydrate
        when={interaction({ events: 'click' })}
        prefetch={async ({ waitFor }) => {
          const reason = await waitFor(interaction({ events: 'dblclick' }))
          setHydrateFirstReason(reason)
        }}
      >
        <InteractiveBox id="enhanced-hydrate-first" label="hydrate first" />
      </Hydrate>

      <p data-testid="enhanced-runtime-wait-reason">{runtimeWaitReason()}</p>
      <p data-testid="enhanced-runtime-status">{runtimeStatus()}</p>
      <button
        data-testid="enhanced-release-runtime-prefetch"
        onClick={() => runtimeGate.resolve()}
      >
        release runtime-only prefetch
      </button>
      <Hydrate
        when={interaction({ events: 'click' })}
        split={false}
        prefetch={async ({ waitFor, preload }) => {
          const waitForReason = waitFor(interaction({ events: 'pointerover' }))
          setRuntimeWaitReason('waiting')
          const reason = await waitForReason
          setRuntimeWaitReason(reason)
          if (reason === 'abort') return

          await runtimeGate.promise
          await preload()
          setRuntimeStatus('ready')
        }}
      >
        <InteractiveBox
          id="enhanced-runtime-only"
          label="runtime only enhanced-runtime-only-child"
        />
      </Hydrate>

      <p data-testid="enhanced-wait-abort-reason">{waitAbortReason()}</p>
      <button
        data-testid="enhanced-hide-wait-abort"
        onClick={() => setShowWaitAbortBoundary(false)}
      >
        hide waitFor abort boundary
      </button>
      <Show when={showWaitAbortBoundary()}>
        <Hydrate
          when={interaction({ events: 'click' })}
          prefetch={async ({ waitFor }) => {
            const waitForReason = waitFor(
              interaction({ events: 'pointerover' }),
            )
            setWaitAbortReason('waiting')
            const reason = await waitForReason
            setWaitAbortReason(reason)
          }}
        >
          <InteractiveBox id="enhanced-wait-abort" label="wait abort" />
        </Hydrate>
      </Show>

      <p data-testid="enhanced-abort-status">{abortStatus()}</p>
      <button
        data-testid="enhanced-hide-abort"
        onClick={() => setShowAbortBoundary(false)}
      >
        hide abort boundary
      </button>
      <Show when={showAbortBoundary()}>
        <Hydrate
          when={interaction({ events: 'click' })}
          prefetch={async ({ signal }) => {
            setAbortStatus('listening')
            await new Promise<void>((resolve) => {
              const onAbort = () => {
                setAbortStatus('aborted')
                resolve()
              }
              if (signal.aborted) {
                onAbort()
                return
              }
              signal.addEventListener('abort', onAbort, { once: true })
            })
          }}
        >
          <InteractiveBox id="enhanced-abort" label="abort" />
        </Hydrate>
      </Show>

      <Hydrate when={media('(max-width: 1px)')}>
        <Hydrate when={() => interaction({ events: 'click' })}>
          <InteractiveBox id="enhanced-dynamic-nested" label="dynamic nested" />
        </Hydrate>
      </Hydrate>
      <EnhancedNestedWidget />

      <Hydrate
        when={interaction({ events: 'click' })}
        prefetch={async ({ waitFor }) => {
          await waitFor(idle({ timeout: 1 }))
        }}
      >
        <InteractiveBox id="enhanced-idle-prefetch" label="idle prefetch" />
      </Hydrate>
    </section>
  )
}
