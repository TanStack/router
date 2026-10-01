import { createFileRoute } from '@tanstack/solid-router'
import { createSignal } from 'solid-js'
import type { ErrorComponentProps } from '@tanstack/solid-router'

export const Route = createFileRoute('/error-component-hydration')({
  validateSearch: (search) => ({
    falsy: search.falsy === true || search.falsy === 'true',
  }),
  loaderDeps: ({ search }) => ({ falsy: search.falsy }),
  loader: ({ deps }) => {
    const loaderError = deps.falsy ? undefined : new Error('loader failed')
    throw loaderError
  },
  component: () => <p data-testid="route-content">Route content</p>,
  errorComponent: InteractiveErrorComponent,
})

function InteractiveErrorComponent(props: ErrorComponentProps) {
  const [clicked, setClicked] = createSignal(false)

  return (
    <section data-testid="error-component">
      <p data-testid="error-message">
        {props.error instanceof Error
          ? props.error.message
          : String(props.error)}
      </p>
      <button
        type="button"
        data-testid="error-component-button"
        data-clicked={clicked() ? 'true' : 'false'}
        onClick={() => setClicked(true)}
      >
        Error action
      </button>
    </section>
  )
}
