import * as Solid from 'solid-js'
import { Dynamic } from 'solid-js/web'
import type { ErrorRouteComponent } from './route'

export function CatchBoundary(
  props: {
    resetKey: number | string
    errorComponent?: ErrorRouteComponent
    onCatch?: (error: Error) => void
  } & Solid.ParentProps,
) {
  const errorComponent = props.errorComponent ?? ErrorComponent

  return (
    <CatchBoundaryImpl resetKey={props.resetKey} onCatch={props.onCatch}>
      {({ error, reset }) => {
        if (error) {
          return (
            <Dynamic component={errorComponent} error={error} reset={reset} />
          )
        }

        return <>{props.children}</>
      }}
    </CatchBoundaryImpl>
  )
}

function CatchBoundaryImpl(props: {
  resetKey: number | string
  children: (props: {
    error: Error | null
    reset: () => void
  }) => Solid.JSX.Element
  onCatch?: (error: Error) => void
}) {
  const [error, setError] = Solid.createSignal<null | Error>(null)

  Solid.createEffect(
    Solid.on(
      () => props.resetKey,
      (resetKey, prevResetKey) => {
        if (resetKey !== prevResetKey) setError(null)
      },
    ),
  )

  return (
    <Solid.ErrorBoundary
      fallback={(e, reset) => {
        reset()
        return null
      }}
    >
      {props.children({
        get error() {
          return error()
        },
        reset: () => setError(null),
      })}
    </Solid.ErrorBoundary>
  )
}

export function ErrorComponent(props: { error: any }) {
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
            {props.error.message ? <code>{props.error.message}</code> : null}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
