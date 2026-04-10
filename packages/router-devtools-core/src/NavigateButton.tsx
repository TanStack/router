import { useStyles } from './useStyles'
import type { AnyRouter, NavigateOptions } from '@tanstack/router-core'
import type { Accessor, JSX } from 'solid-js'

interface Props extends NavigateOptions {
  router: Accessor<AnyRouter>
}

export function NavigateButton({ to, params, search, router }: Props): JSX.Element {
  const styles = useStyles()

  return (
    <button
      type="button"
      title={`Navigate to ${to}`}
      class={styles().navigateButton}
      onClick={(e) => {
        e.stopPropagation()
        router().navigate({ to, params, search })
      }}
    >
      ➔
    </button>
  )
}
