import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { Hydrate } from '@tanstack/react-start'
import {
  idle,
  interaction,
  media,
  visible,
} from '@tanstack/react-start/hydration'
import { EnhancedNestedWidget } from '../shared/EnhancedNestedWidget'
import type { HydrateOptions } from '@tanstack/react-start'

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

function useDeferredGate() {
  const ref = React.useRef<DeferredGate | undefined>(undefined)
  ref.current ??= createDeferredGate()
  return ref.current
}

const belowFoldProps = {
  when: () => visible({ rootMargin: '0px' }),
} satisfies HydrateOptions

function InteractiveBox(props: { id: string; label: string }) {
  const [count, setCount] = React.useState(0)
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <button
      data-testid={`${props.id}-button`}
      data-hydrated={hydrated ? 'true' : 'false'}
      onClick={() => setCount((prev) => prev + 1)}
    >
      {props.label}: <span data-testid={`${props.id}-count`}>{count}</span>
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
  const searchDrivenHydration = React.useCallback(
    () => dynamicFromSearch(search.dynamic),
    [search.dynamic],
  )
  const [rerenders, setRerenders] = React.useState(0)
  const splitGate = useDeferredGate()
  const fireGate = useDeferredGate()
  const runtimeGate = useDeferredGate()
  const [splitWaitReason, setSplitWaitReason] = React.useState('idle')
  const [splitPreload, setSplitPreload] = React.useState('idle')
  const [splitQuery, setSplitQuery] = React.useState('idle')
  const [fireStatus, setFireStatus] = React.useState('idle')
  const [fireWaitReason, setFireWaitReason] = React.useState('idle')
  const [firePreload, setFirePreload] = React.useState('idle')
  const [fireQuery, setFireQuery] = React.useState('idle')
  const [hydrateFirstReason, setHydrateFirstReason] = React.useState('idle')
  const [runtimeWaitReason, setRuntimeWaitReason] = React.useState('idle')
  const [runtimeStatus, setRuntimeStatus] = React.useState('idle')
  const [waitAbortReason, setWaitAbortReason] = React.useState('idle')
  const [abortStatus, setAbortStatus] = React.useState('idle')
  const [showWaitAbortBoundary, setShowWaitAbortBoundary] = React.useState(true)
  const [showAbortBoundary, setShowAbortBoundary] = React.useState(true)

  return (
    <section>
      <h1 data-testid="enhanced-heading">Enhanced Hydrate APIs</h1>
      <p data-testid="enhanced-rerenders">{rerenders}</p>
      <button
        data-testid="enhanced-rerender"
        onClick={() => setRerenders((count) => count + 1)}
      >
        rerender parent
      </button>

      <p className="dh-note">
        Dynamic visible uses reusable <code>HydrateOptions</code> spread props.
      </p>
      <div className="dh-spacer">Scroll to dynamic visible</div>
      <Hydrate {...belowFoldProps}>
        <InteractiveBox id="enhanced-dynamic-visible" label="dynamic visible" />
      </Hydrate>

      <p className="dh-note">
        This callback reads typed TanStack Router search state, so it must not
        run during server rendering.
      </p>
      <div className="dh-spacer">Scroll to conditional dynamic boundary</div>
      <Hydrate when={searchDrivenHydration}>
        <InteractiveBox
          id="enhanced-dynamic-conditional"
          label="conditional dynamic"
        />
      </Hydrate>

      <p className="dh-note">
        Dynamic interaction stays unhydrated across parent rerenders and
        hydrates on click.
      </p>
      <Hydrate when={() => interaction({ events: 'click' })}>
        <InteractiveBox
          id="enhanced-dynamic-interaction"
          label="dynamic interaction"
        />
      </Hydrate>

      <p data-testid="enhanced-split-wait-reason">{splitWaitReason}</p>
      <p data-testid="enhanced-split-preload">{splitPreload}</p>
      <p data-testid="enhanced-split-query">{splitQuery}</p>
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

      <p data-testid="enhanced-fire-status">{fireStatus}</p>
      <p data-testid="enhanced-fire-wait-reason">{fireWaitReason}</p>
      <p data-testid="enhanced-fire-preload">{firePreload}</p>
      <p data-testid="enhanced-fire-query">{fireQuery}</p>
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

      <p data-testid="enhanced-hydrate-first-reason">{hydrateFirstReason}</p>
      <Hydrate
        when={interaction({ events: 'click' })}
        prefetch={async ({ waitFor }) => {
          const reason = await waitFor(interaction({ events: 'dblclick' }))
          setHydrateFirstReason(reason)
        }}
      >
        <InteractiveBox id="enhanced-hydrate-first" label="hydrate first" />
      </Hydrate>

      <p data-testid="enhanced-runtime-wait-reason">{runtimeWaitReason}</p>
      <p data-testid="enhanced-runtime-status">{runtimeStatus}</p>
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

      <p data-testid="enhanced-wait-abort-reason">{waitAbortReason}</p>
      <button
        data-testid="enhanced-hide-wait-abort"
        onClick={() => setShowWaitAbortBoundary(false)}
      >
        hide waitFor abort boundary
      </button>
      {showWaitAbortBoundary ? (
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
      ) : null}

      <p data-testid="enhanced-abort-status">{abortStatus}</p>
      <button
        data-testid="enhanced-hide-abort"
        onClick={() => setShowAbortBoundary(false)}
      >
        hide abort boundary
      </button>
      {showAbortBoundary ? (
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
      ) : null}

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
