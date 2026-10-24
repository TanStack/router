import { ErrorComponent, Link, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <main>
      <ErrorComponent error={error} />
      <button
        onClick={() => {
          router.invalidate()
        }}
      >
        Try Again
      </button>
      <Link to="/">Home</Link>
    </main>
  )
}
