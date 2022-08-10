import * as React from 'react'
import { RouteLoaders, useMatch } from '@tanstack/react-location'
import { delayFn } from '../main'

const loader = () =>
  delayFn(() => ({
    reallyExpensiveTimestamp: Date.now(),
  }))

// A Router Loader object
export const loaders: RouteLoaders = {
  element: <ReallyExpensive />,
  loader,
}

function ReallyExpensive() {
  const {
    data: { reallyExpensiveTimestamp },
  } = useMatch<Awaited<ReturnType<typeof loader>>>()

  React.useEffect(() => {
    console.info({ reallyExpensiveTimestamp })
  })

  return (
    <div className={`p-2`}>
      I am another "really expensive" component. <em>However</em>, I was not
      only code-split, but I also{' '}
      <strong>fetched async data while you navigated to me!</strong>
      <div className={`h-2`} />
      <small>
        (Unless you have preloading turned on, in which case I fetched it when
        you hovered over my Link)
      </small>{' '}
      😉
      <div className={`h-2`} />
      🎉 Check your console to see the "expensive" data.
    </div>
  )
}
