import { useRouterState } from '@tanstack/react-router'
import { subscriberIndices } from '../../shared'
import { SubscriberValue } from './subscriberValue'

function RouterPathSubscriber(props: { index: number }) {
  const value = useRouterState({
    select: (state) => state.location.pathname.length,
  })

  return <SubscriberValue kind="routerPath" index={props.index} value={value} />
}

function RouterStatusSubscriber(props: { index: number }) {
  const value = useRouterState({
    select: (state) => ({
      status: state.status,
      loading: state.isLoading,
    }),
    structuralSharing: true,
  })

  return (
    <SubscriberValue kind="routerStatus" index={props.index} value={value} />
  )
}

function RouterHashSubscriber(props: { index: number }) {
  const value = useRouterState({
    select: (state) => state.location.hash,
  })

  return <SubscriberValue kind="routerHash" index={props.index} value={value} />
}

function RouterSearchObjectSubscriber(props: { index: number }) {
  const value = useRouterState({
    select: (state) => {
      const search = state.location.search as Partial<{
        mode: string
        objectKey: number
      }>

      return {
        mode: search.mode ?? '',
        objectKey: Number(search.objectKey ?? 0),
      }
    },
    structuralSharing: true,
  })

  return (
    <SubscriberValue
      kind="routerSearchObject"
      index={props.index}
      value={value}
    />
  )
}

export function RouterStateSubscribers() {
  return (
    <>
      {subscriberIndices.routerState.map((index) => {
        const group = index % 4

        if (group === 0) {
          return <RouterPathSubscriber key={index} index={index} />
        }

        if (group === 1) {
          return <RouterStatusSubscriber key={index} index={index} />
        }

        if (group === 2) {
          return <RouterHashSubscriber key={index} index={index} />
        }

        return <RouterSearchObjectSubscriber key={index} index={index} />
      })}
    </>
  )
}
