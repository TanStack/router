import { For } from 'solid-js'
import { useRouterState } from '@tanstack/solid-router'
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
    <For each={subscriberIndices.routerState}>
      {(index) => {
        const group = index % 4

        if (group === 0) {
          return <RouterPathSubscriber index={index} />
        }

        if (group === 1) {
          return <RouterStatusSubscriber index={index} />
        }

        if (group === 2) {
          return <RouterHashSubscriber index={index} />
        }

        return <RouterSearchObjectSubscriber index={index} />
      }}
    </For>
  )
}
