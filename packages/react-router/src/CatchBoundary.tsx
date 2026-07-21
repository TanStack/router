'use client'

import * as React from 'react'
import type { ErrorRouteComponent } from './route'
import type { ErrorInfo } from 'react'

export function CatchBoundary(props: {
  getResetKey: () => unknown
  children: React.ReactNode
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: Error, errorInfo: ErrorInfo) => void
}) {
  return <CatchBoundaryImpl {...props} />
}

class CatchBoundaryImpl extends React.Component<{
  getResetKey: () => unknown
  children: React.ReactNode
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: Error, errorInfo: ErrorInfo) => void
}> {
  state = { error: null } as { error: Error | null; resetKey?: unknown }

  static getDerivedStateFromProps(
    props: { getResetKey: () => unknown },
    state: { resetKey?: unknown; error: Error | null },
  ) {
    const resetKey = props.getResetKey()

    if (state.error && state.resetKey !== resetKey) {
      return { resetKey, error: null }
    }

    return { resetKey }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  reset = () => {
    this.setState({ error: null })
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onCatch?.(error, errorInfo)
  }
  render() {
    const error = this.state.error
    return error
      ? React.createElement(this.props.errorComponent ?? ErrorComponent, {
          error,
          reset: this.reset,
        })
      : this.props.children
  }
}

export function ErrorComponent({ error }: { error: any }) {
  const [show, setShow] = React.useState(process.env.NODE_ENV !== 'production')

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
