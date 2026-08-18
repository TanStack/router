'use client'

import * as React from 'react'
import { wrapInNonRouteComponentContext } from './nonRouteComponentContext'
import type { ErrorRouteComponent } from './route'
import type { ErrorInfo } from 'react'

export class CatchBoundary extends React.Component<{
  getResetKey: () => unknown
  children: React.ReactNode
  errorComponent?: ErrorRouteComponent
  onCatch?: (error: Error, errorInfo: ErrorInfo) => void
}> {
  // hasError tracks the caught state separately from the error value: a thrown
  // falsy value (undefined, null, 0, '') would otherwise re-render the crashing
  // children and escalate to an uncaught error at the root.
  state = { error: null, hasError: false } as {
    error: Error | null
    hasError: boolean
    resetKey?: unknown
  }

  static getDerivedStateFromProps(
    props: { getResetKey: () => unknown },
    state: { resetKey?: unknown; error: Error | null; hasError: boolean },
  ) {
    const resetKey = props.getResetKey()

    if (state.hasError && state.resetKey !== resetKey) {
      return { resetKey, error: null, hasError: false }
    }

    return { resetKey }
  }
  static getDerivedStateFromError(error: Error) {
    return { error, hasError: true }
  }
  reset = () => {
    this.setState({ error: null, hasError: false })
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onCatch?.(error, errorInfo)
  }
  render() {
    const error = this.state.error
    if (this.state.hasError) {
      const element = React.createElement(
        this.props.errorComponent ?? ErrorComponent,
        {
          // The value passes through as thrown; non-Error throws already reached
          // errorComponent under the previous truthy gate with this same typing.
          error: error as Error,
          reset: this.reset,
        },
      )

      return process.env.NODE_ENV !== 'production'
        ? wrapInNonRouteComponentContext(element, 'errorComponent')
        : element
    }

    return this.props.children
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
            {error?.message ? <code>{error.message}</code> : null}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
