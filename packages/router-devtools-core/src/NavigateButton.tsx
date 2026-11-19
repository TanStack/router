import type { AnyRouter, NavigateOptions } from '@tanstack/router-core'
import type { Accessor } from 'solid-js'

interface Props extends NavigateOptions {
  router: Accessor<AnyRouter>
}

export function NavigateButton(props: Props) {
  return (
    <button
      type="button"
      title={`Navigate to ${props.to}`}
      class="tsrd-navigate-button"
      onClick={(e) => {
        e.stopPropagation()
        props.router().navigate({
          to: props.to,
          params: props.params,
          search: props.search,
        })
      }}
    >
      ➔
    </button>
  )
}
