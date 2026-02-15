import { Component, h } from 'preact'
import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { ErrorRouteComponent } from './route'

export function CatchBoundary(props: {
  getResetKey: () => number | string
  children: ComponentChildren
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: Error, errorInfo: { componentStack?: string }) => void
}) {
  const errorComponent = props.errorComponent ?? ErrorComponent

  return (
    <CatchBoundaryImpl
      getResetKey={props.getResetKey}
      onCatch={props.onCatch}
      children={({ error, reset }) => {
        if (error) {
          return h(errorComponent, {
            error,
            reset,
          })
        }

        return props.children
      }}
    />
  )
}

class CatchBoundaryImpl extends Component<
  {
    getResetKey: () => number | string
    children: (props: {
      error: Error | null
      reset: () => void
    }) => ComponentChildren
    onCatch?: (error: Error, errorInfo: { componentStack?: string }) => void
  },
  { error: Error | null; resetKey: string }
> {
  state = { error: null as Error | null, resetKey: '' }

  static getDerivedStateFromProps(props: any) {
    return { resetKey: props.getResetKey() }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  reset() {
    this.setState({ error: null })
  }
  componentDidUpdate(
    prevProps: any,
    prevState: any,
  ): void {
    if (prevState.error && prevState.resetKey !== this.state.resetKey) {
      this.reset()
    }
  }
  componentDidCatch(error: Error, errorInfo: any) {
    if (this.props.onCatch) {
      this.props.onCatch(error, errorInfo)
    }
  }
  render() {
    return this.props.children({
      error:
        this.state.resetKey !== this.props.getResetKey()
          ? null
          : this.state.error,
      reset: () => {
        this.reset()
      },
    })
  }
}

export function ErrorComponent({ error }: { error: any }) {
  const [show, setShow] = useState(process.env.NODE_ENV !== 'production')

  return (
    <div style={{ padding: '.5rem', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <strong style={{ fontSize: '1rem' }}>Something went wrong!</strong>
        <button
          style={{
            appearance: 'none',
            fontSize: '.6em',
            border: '1px solid currentColor',
            padding: '.1rem .2rem',
            fontWeight: 'bold',
            borderRadius: '.25rem',
          }}
          onClick={() => setShow((d) => !d)}
        >
          {show ? 'Hide Error' : 'Show Error'}
        </button>
      </div>
      <div style={{ height: '.25rem' }} />
      {show ? (
        <div>
          <pre
            style={{
              fontSize: '.7em',
              border: '1px solid red',
              borderRadius: '.25rem',
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
