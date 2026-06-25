import * as Vue from 'vue'
import { useRouterState } from '@tanstack/vue-router'
import { subscriberIndices } from '../../shared'
import { SubscriberValue } from './subscriberValue'

const RouterPathSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useRouterState({
      select: (state) => state.location.pathname.length,
    })

    return () => (
      <SubscriberValue
        kind="routerPath"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const RouterStatusSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useRouterState({
      select: (state) => ({
        status: state.status,
        loading: state.isLoading,
      }),
    })

    return () => (
      <SubscriberValue
        kind="routerStatus"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const RouterHashSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useRouterState({
      select: (state) => state.location.hash,
    })

    return () => (
      <SubscriberValue
        kind="routerHash"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const RouterSearchObjectSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
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

    return () => (
      <SubscriberValue
        kind="routerSearchObject"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

export const RouterStateSubscribers = Vue.defineComponent({
  setup() {
    return () => (
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
  },
})
