import * as Solid from 'solid-js'
import { Dynamic } from '@solidjs/web'
import { renderInNonRouteComponentContext } from './nonRouteComponentContext'
import type { ErrorRouteComponent } from './route'
import type { JSX } from '@solidjs/web'

type CatchBoundaryProps = {
  getResetKey: () => unknown
  children?: JSX.Element
  render?: () => JSX.Element
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: Error) => void
} & Solid.ParentProps

export function CatchBoundary(props: CatchBoundaryProps) {
  const [retryKey, setRetryKey] = Solid.createSignal<object>({})
  let resetBoundary: (() => void) | undefined
  let initialized = false
  let previousKey: unknown

  Solid.onCleanup(() => {
    resetBoundary = undefined
  })

  Solid.createEffect(props.getResetKey, (key) => {
    if (!initialized) {
      initialized = true
      previousKey = key
      return
    }

    // The effect re-runs on every recompute of the key function, not only
    // on value changes — gate on the value so an unchanged key can't
    // recreate the retried subtree while it settles.
    if (key === previousKey) {
      return
    }
    previousKey = key

    const reset = resetBoundary
    if (reset) {
      queueMicrotask(() => {
        if (resetBoundary !== reset) {
          return
        }
        setRetryKey({})
        reset()
        Solid.flush()
      })
    }
  })

  return (
    <Solid.Errored
      fallback={(error, reset) => {
        const resolvedError = Solid.untrack(() => error() as Error)

        props.onCatch?.(resolvedError)
        resetBoundary = reset

        return renderErrorComponent(props, resolvedError, reset)
      }}
    >
      <Solid.Show when={retryKey()} keyed>
        {(_retryKey) => props.render?.() ?? props.children}
      </Solid.Show>
    </Solid.Errored>
  )
}

// Route load errors already exist in match state during SSR. Render them at
// the boundary position on both the server and client so Solid hydrates the
// same owner tree instead of entering its error fallback from only one side.
export function RouteCatchBoundary(
  props: CatchBoundaryProps & {
    hasError: () => boolean
    getError: () => unknown
    isServer: boolean
  },
) {
  const [retryKey, setRetryKey] = Solid.createSignal<object>({})
  let initialized = false
  let previousError: unknown

  Solid.createEffect(props.getError, (error) => {
    if (!initialized) {
      initialized = true
      previousError = error
      return
    }
    if (Object.is(error, previousError)) {
      return
    }
    previousError = error
    setRetryKey({})
  })

  const renderRouteError = () => {
    const resolvedError = Solid.untrack(props.getError) as Error
    const reset = () => setRetryKey({})

    if (!props.isServer) {
      props.onCatch?.(resolvedError)
    }

    return renderErrorComponent(props, resolvedError, reset)
  }

  return (
    <Solid.Show
      when={props.hasError()}
      fallback={
        <CatchBoundary
          getResetKey={props.getResetKey}
          errorComponent={props.errorComponent}
          onCatch={props.onCatch}
          render={props.render}
        >
          {props.children}
        </CatchBoundary>
      }
    >
      <Solid.Show when={retryKey()} keyed>
        {(_retryKey) => renderRouteError()}
      </Solid.Show>
    </Solid.Show>
  )
}

function renderErrorComponent(
  props: Pick<CatchBoundaryProps, 'errorComponent'>,
  resolvedError: Error,
  reset: () => void,
) {
  return process.env.NODE_ENV !== 'production' ? (
    renderInNonRouteComponentContext(
      () => (
        <Dynamic
          component={props.errorComponent ?? ErrorComponent}
          error={resolvedError}
          reset={reset}
        />
      ),
      'errorComponent',
    )
  ) : (
    <Dynamic
      component={props.errorComponent ?? ErrorComponent}
      error={resolvedError}
      reset={reset}
    />
  )
}

export function ErrorComponent({ error }: { error: any }) {
  const [show, setShow] = Solid.createSignal(
    process.env.NODE_ENV !== 'production',
  )

  return (
    <div style={{ padding: '.5rem', 'max-width': '100%' }}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '.5rem' }}>
        <strong style={{ 'font-size': '1rem' }}>Something went wrong!</strong>
        <button
          style={{
            appearance: 'none',
            'font-size': '.6em',
            border: '1px solid currentColor',
            padding: '.1rem .2rem',
            'font-weight': 'bold',
            'border-radius': '.25rem',
          }}
          onClick={() => setShow((d) => !d)}
        >
          {show() ? 'Hide Error' : 'Show Error'}
        </button>
      </div>
      <div style={{ height: '.25rem' }} />
      {show() ? (
        <div>
          <pre
            style={{
              'font-size': '.7em',
              border: '1px solid red',
              'border-radius': '.25rem',
              padding: '.3rem',
              color: 'red',
              overflow: 'auto',
            }}
          >
            {error.message ? <code>{error.message}</code> : null}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
