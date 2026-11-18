import * as React from 'react'

type RemoteBoundaryProps = {
  name: string
  children: React.ReactNode
}

export class RemoteBoundary extends React.Component<
  RemoteBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn(`[${this.props.name}] remote failed to render`, error)
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="remote-fallback">{this.props.name} is unavailable.</p>
      )
    }

    return (
      <React.Suspense
        fallback={<p className="remote-fallback">Loading {this.props.name}…</p>}
      >
        {this.props.children}
      </React.Suspense>
    )
  }
}
