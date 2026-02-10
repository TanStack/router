import * as React from 'react'

export function FederatedMessage() {
  const [count, setCount] = React.useState(0)

  return (
    <button
      data-testid="federated-button"
      onClick={() => setCount((value) => value + 1)}
      type="button"
    >
      Federated message from remote (count: {count})
    </button>
  )
}
