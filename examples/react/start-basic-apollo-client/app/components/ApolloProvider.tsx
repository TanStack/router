import {
  WrapApolloProvider,
  QueryEvent,
  DataTransportContext,
} from '@apollo/client-react-streaming'
import { useRouter } from '@tanstack/react-router'
import {
  ComponentProps,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react'

const APOLLO_EVENT_PREFIX = '@@apollo.event/'
const APOLLO_HOOK_PREFIX = '@@apollo.hook/'

const handledEvents = new WeakSet<object>()

export const ApolloProvider = WrapApolloProvider((props) => {
  const router = useRouter()

  const consumeBackPressure = useCallback(() => {
    for (const key of router.streamedKeys) {
      if (key.startsWith(APOLLO_EVENT_PREFIX)) {
        const streamedValue = router.getStreamedValue(key)
        if (
          streamedValue &&
          typeof streamedValue === 'object' &&
          !handledEvents.has(streamedValue) &&
          props.onQueryEvent
        ) {
          handledEvents.add(streamedValue)
          props.onQueryEvent(streamedValue as QueryEvent)
        }
      }
    }
  }, [router, props.onQueryEvent])

  if (router.isServer) {
    props.registerDispatchRequestStarted!(({ event, observable }) => {
      router.streamValue(
        `${APOLLO_EVENT_PREFIX}${event.id}/${event.type}`,
        event satisfies QueryEvent,
      )
      observable.subscribe({
        next(event) {
          router.streamValue(
            `${APOLLO_EVENT_PREFIX}${event.id}/${event.type}`,
            event satisfies QueryEvent,
          )
        },
      })
    })
  } else {
    // this needs to happen synchronously before the render continues
    // so "loading" is kicked off before the respecitve component is rendered
    consumeBackPressure()
  }

  useEffect(() => {
    consumeBackPressure()
    return router.subscribe('onStreamedValue', ({ key }) => {
      if (!key.startsWith(APOLLO_EVENT_PREFIX)) return
      const streamedValue = router.getStreamedValue(key)
      if (streamedValue && props.onQueryEvent) {
        handledEvents.add(streamedValue)
        props.onQueryEvent(streamedValue as QueryEvent)
      }
    })
  }, [consumeBackPressure, router, props.onQueryEvent])

  const dataTransport = useMemo(() => ({ useStaticValueRef }), [])

  return (
    <DataTransportContext.Provider value={dataTransport}>
      {props.children}
    </DataTransportContext.Provider>
  )
})

function useStaticValueRef<T>(value: T) {
  const router = useRouter()
  const key = APOLLO_HOOK_PREFIX + useId()
  const dataValue =
    !router.isServer && router.streamedKeys.has(key)
      ? (router.getStreamedValue(key) as T)
      : value
  const dataRef = useRef(dataValue)

  if (router.isServer) {
    if (!router.streamedKeys.has(key)) {
      router.streamValue(key, value)
    }
  }
  return dataRef
}
