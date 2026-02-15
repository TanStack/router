import { Component } from 'preact'
import type { ComponentChildren } from 'preact'

interface SuspenseProps {
  fallback?: ComponentChildren
  children: ComponentChildren
}

interface SuspenseState {
  pending: boolean
}

export class Suspense extends Component<SuspenseProps, SuspenseState> {
  state = { pending: false }
  _pendingPromises = new Set<Promise<any>>()

  componentDidCatch(err: any) {
    if (err && typeof err.then === 'function') {
      // It's a thrown promise (suspense protocol)
      this._pendingPromises.add(err)
      this.setState({ pending: true })
      err.then(
        () => {
          this._pendingPromises.delete(err)
          if (this._pendingPromises.size === 0) {
            this.setState({ pending: false })
          }
        },
        () => {
          this._pendingPromises.delete(err)
          if (this._pendingPromises.size === 0) {
            this.setState({ pending: false })
          }
        },
      )
    }
  }

  render() {
    if (this.state.pending) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
