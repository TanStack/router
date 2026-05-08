import * as React from 'react'

export function StartupMarker() {
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <span
      className="visually-hidden"
      data-testid="startup-marker"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      startup {hydrated ? 'hydrated' : 'pending'}
    </span>
  )
}
