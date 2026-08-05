import * as Solid from 'solid-js'
import { Dynamic } from '@solidjs/web'
import type { ErrorRouteComponent } from './route'
import type { JSX } from '@solidjs/web'

export function CatchBoundary(
  props: {
    getResetKey: () => unknown
    children?: JSX.Element
    render?: () => JSX.Element
    errorComponent?: ErrorRouteComponent
    onCatch?: (error: Error) => void
  } & Solid.ParentProps,
) {
  const [retryKey, setRetryKey] = Solid.createSignal<object>({})
  let resetBoundary: (() => void) | undefined
  let initialized = false

  Solid.onCleanup(() => {
    resetBoundary = undefined
  })

  Solid.createEffect(props.getResetKey, () => {
    if (!initialized) {
      initialized = true
      return
    }

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

        return (
          <Dynamic
            component={props.errorComponent ?? ErrorComponent}
            error={resolvedError}
            reset={reset}
          />
        )
      }}
    >
      <Solid.Show when={retryKey()} keyed>
        {(_retryKey) => props.render?.() ?? props.children}
      </Solid.Show>
    </Solid.Errored>
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
